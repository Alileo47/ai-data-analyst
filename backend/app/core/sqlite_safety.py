import re
import sqlite3
from pathlib import Path
from typing import Any, Sequence
from urllib.parse import quote


FORBIDDEN_KEYWORDS = (
    "DROP",
    "DELETE",
    "UPDATE",
    "INSERT",
    "ALTER",
    "ATTACH",
    "PRAGMA",
    "VACUUM",
)

_KEYWORD_PATTERN = re.compile(r"(?<![\w])(" + "|".join(FORBIDDEN_KEYWORDS) + r")(?![\w])", re.I)
_READ_ONLY_START_PATTERN = re.compile(r"^\s*(SELECT|WITH)\b", re.I)


class UnsafeSQLError(ValueError):
    pass


def _strip_leading_comments(sql: str) -> str:
    index = 0
    length = len(sql)
    while index < length:
        if sql[index:].startswith("--"):
            newline = sql.find("\n", index + 2)
            index = length if newline == -1 else newline + 1
        elif sql[index:].startswith("/*"):
            end = sql.find("*/", index + 2)
            if end == -1:
                raise UnsafeSQLError("Unterminated SQL comment.")
            index = end + 2
        else:
            break
    return sql[index:]


def _mask_comments_and_literals(sql: str) -> str:
    chars = list(sql)
    quote_char = ""
    index = 0

    while index < len(sql):
        char = sql[index]

        if quote_char:
            chars[index] = " "
            if quote_char == "]":
                if char == "]":
                    quote_char = ""
            elif char == quote_char:
                if index + 1 < len(sql) and sql[index + 1] == quote_char:
                    chars[index + 1] = " "
                    index += 1
                else:
                    quote_char = ""
            index += 1
            continue

        if char in ("'", '"', "`"):
            quote_char = char
            chars[index] = " "
        elif char == "[":
            quote_char = "]"
            chars[index] = " "
        elif sql.startswith("--", index):
            newline = sql.find("\n", index + 2)
            end = len(sql) if newline == -1 else newline
            for position in range(index, end):
                chars[position] = " "
            index = end
            continue
        elif sql.startswith("/*", index):
            end = sql.find("*/", index + 2)
            if end == -1:
                return "".join(chars)
            end += 2
            for position in range(index, end):
                chars[position] = " "
            index = end
            continue
        index += 1

    return "".join(chars)


def _top_level_semicolon_count(sql: str) -> int:
    count = 0
    quote_char = ""
    index = 0
    length = len(sql)

    while index < length:
        char = sql[index]

        if quote_char:
            if quote_char == "]":
                if char == "]":
                    quote_char = ""
            elif char == quote_char:
                if index + 1 < length and sql[index + 1] == quote_char:
                    index += 1
                else:
                    quote_char = ""
            elif quote_char == "`" and char == "`":
                quote_char = ""
            index += 1
            continue

        if char in ("'", '"', "`"):
            quote_char = char
        elif char == "[":
            quote_char = "]"
        elif sql.startswith("--", index):
            newline = sql.find("\n", index + 2)
            index = length if newline == -1 else newline
        elif sql.startswith("/*", index):
            end = sql.find("*/", index + 2)
            if end == -1:
                raise UnsafeSQLError("Unterminated SQL comment.")
            index = end + 1
        elif char == ";":
            count += 1
        index += 1

    return count


def _top_level_semicolon_index(sql: str) -> int | None:
    quote_char = ""
    index = 0
    length = len(sql)

    while index < length:
        char = sql[index]
        if quote_char:
            if quote_char == "]":
                if char == "]":
                    quote_char = ""
            elif char == quote_char:
                if index + 1 < length and sql[index + 1] == quote_char:
                    index += 1
                else:
                    quote_char = ""
            index += 1
            continue
        if char in ("'", '"', "`"):
            quote_char = char
        elif char == "[":
            quote_char = "]"
        elif sql.startswith("--", index):
            newline = sql.find("\n", index + 2)
            index = length if newline == -1 else newline
        elif sql.startswith("/*", index):
            end = sql.find("*/", index + 2)
            if end == -1:
                raise UnsafeSQLError("Unterminated SQL comment.")
            index = end + 1
        elif char == ";":
            return index
        index += 1
    return None


def _only_comments_and_whitespace(text: str) -> bool:
    index = 0
    length = len(text)
    while index < length:
        if text[index].isspace():
            index += 1
        elif text.startswith("--", index):
            newline = text.find("\n", index + 2)
            if newline == -1:
                return True
            index = newline + 1
        elif text.startswith("/*", index):
            end = text.find("*/", index + 2)
            if end == -1:
                return False
            index = end + 2
        else:
            return False
    return True


def validate_read_only_sql(sql: str) -> str:
    if not isinstance(sql, str) or not sql.strip():
        raise UnsafeSQLError("SQL query cannot be empty.")

    normalized = sql.strip()
    semicolon_count = _top_level_semicolon_count(normalized)
    if semicolon_count > 1:
        raise UnsafeSQLError("Multiple SQL statements are not allowed.")
    if semicolon_count == 1:
        semicolon_index = _top_level_semicolon_index(normalized)
        if semicolon_index is None:
            raise UnsafeSQLError("Multiple SQL statements are not allowed.")
        suffix = normalized[semicolon_index + 1 :]
        if not _only_comments_and_whitespace(suffix):
            raise UnsafeSQLError("Multiple SQL statements are not allowed.")
        normalized = normalized[:semicolon_index].rstrip()

    code_without_comments = _strip_leading_comments(normalized)
    if not _READ_ONLY_START_PATTERN.match(code_without_comments):
        raise UnsafeSQLError("Only SELECT or WITH statements are allowed.")

    forbidden = _KEYWORD_PATTERN.search(_mask_comments_and_literals(normalized))
    if forbidden:
        raise UnsafeSQLError(
            f"Forbidden SQL keyword detected: {forbidden.group(1).upper()}."
        )

    return normalized


def sqlite_readonly_uri(database_path: str | Path) -> str:
    path = Path(database_path).resolve()
    return f"file:{quote(str(path), safe='/')}?mode=ro"


def open_readonly_sqlite(database_path: str | Path) -> sqlite3.Connection:
    connection = sqlite3.connect(
        sqlite_readonly_uri(database_path),
        uri=True,
        timeout=5,
    )
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only = ON")
    connection.set_authorizer(_read_only_authorizer)
    return connection


def _read_only_authorizer(
    action: int,
    arg1: str | None,
    arg2: str | None,
    database: str | None,
    source: str | None,
) -> int:
    denied_actions = {
        sqlite3.SQLITE_CREATE_INDEX,
        sqlite3.SQLITE_CREATE_TABLE,
        sqlite3.SQLITE_CREATE_TEMP_INDEX,
        sqlite3.SQLITE_CREATE_TEMP_TABLE,
        sqlite3.SQLITE_CREATE_TEMP_TRIGGER,
        sqlite3.SQLITE_CREATE_TEMP_VIEW,
        sqlite3.SQLITE_CREATE_TRIGGER,
        sqlite3.SQLITE_CREATE_VIEW,
        sqlite3.SQLITE_DELETE,
        sqlite3.SQLITE_DROP_INDEX,
        sqlite3.SQLITE_DROP_TABLE,
        sqlite3.SQLITE_DROP_TEMP_INDEX,
        sqlite3.SQLITE_DROP_TEMP_TABLE,
        sqlite3.SQLITE_DROP_TEMP_TRIGGER,
        sqlite3.SQLITE_DROP_TEMP_VIEW,
        sqlite3.SQLITE_DROP_TRIGGER,
        sqlite3.SQLITE_DROP_VIEW,
        sqlite3.SQLITE_INSERT,
        sqlite3.SQLITE_UPDATE,
        sqlite3.SQLITE_ALTER_TABLE,
        sqlite3.SQLITE_ATTACH,
        sqlite3.SQLITE_DETACH,
        sqlite3.SQLITE_PRAGMA,
        sqlite3.SQLITE_TRANSACTION,
        sqlite3.SQLITE_SAVEPOINT,
    }
    if action in denied_actions:
        return sqlite3.SQLITE_DENY
    return sqlite3.SQLITE_OK


def execute_read_only(
    database_path: str | Path,
    sql: str,
    parameters: Sequence[Any] | None = None,
) -> tuple[list[str], list[dict[str, Any]]]:
    validated_sql = validate_read_only_sql(sql)
    connection = open_readonly_sqlite(database_path)
    try:
        cursor = connection.execute(validated_sql, parameters or ())
        columns = [description[0] for description in cursor.description or ()]
        rows = [dict(row) for row in cursor.fetchall()]
        return columns, rows
    finally:
        connection.close()
