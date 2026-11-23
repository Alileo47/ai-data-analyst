import re
import sqlite3
from pathlib import Path
from typing import Any, Iterable

import pandas as pd
from openpyxl import load_workbook

from app.core.errors import (
    InvalidDataError,
    UnsupportedFileError,
)
from app.services.lifecycle import new_session_id


MAX_PREVIEW_ROWS = 10
MAX_ROWS_PER_TABLE = 250_000
MAX_COLUMNS_PER_TABLE = 250
MAX_SQL_STATEMENTS = 2_000

_INVALID_IDENTIFIER_CHARACTERS = re.compile(r"[^A-Za-z0-9_]")


def _safe_table_name(name: str, used: set[str]) -> str:
    safe = _INVALID_IDENTIFIER_CHARACTERS.sub("_", name.strip()).strip("_")
    if not safe:
        safe = "table"
    if safe[0].isdigit():
        safe = f"table_{safe}"

    candidate = safe
    suffix = 2
    while candidate.lower() in used:
        candidate = f"{safe}_{suffix}"
        suffix += 1
    used.add(candidate.lower())
    return candidate


def _clean_dataframe(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.dropna(how="all").dropna(axis=1, how="all")
    frame = frame.replace([float("inf"), float("-inf")], pd.NA)
    frame = frame.fillna(pd.NA)
    if len(frame.columns) > MAX_COLUMNS_PER_TABLE:
        raise InvalidDataError(
            f"Table exceeds the {MAX_COLUMNS_PER_TABLE}-column import limit."
        )
    if len(frame) > MAX_ROWS_PER_TABLE:
        raise InvalidDataError(
            f"Table exceeds the {MAX_ROWS_PER_TABLE}-row import limit."
        )
    if frame.empty:
        raise InvalidDataError("The uploaded data contains no usable rows.")
    return frame


def _prepare_column_names(frame: pd.DataFrame) -> pd.DataFrame:
    names: list[str] = []
    used: set[str] = set()
    for position, original in enumerate(frame.columns, start=1):
        name = str(original).strip() if not pd.isna(original) else ""
        names.append(_safe_table_name(name or f"column_{position}", used))
    frame.columns = names
    return frame


def _inspect_database(database_path: Path) -> dict[str, Any]:
    connection = sqlite3.connect(database_path)
    try:
        tables = [
            row[0]
            for row in connection.execute(
                """
                SELECT name
                FROM sqlite_master
                WHERE type = 'table'
                  AND name NOT LIKE 'sqlite_%'
                ORDER BY name
                """
            )
        ]
        if not tables:
            raise InvalidDataError("The uploaded file contains no usable tables.")

        table_summaries: list[dict[str, Any]] = []
        all_preview: dict[str, Any] = {}
        for table_name in tables:
            escaped = table_name.replace('"', '""')
            columns = [
                {"name": row[1], "type": row[2] or "TEXT"}
                for row in connection.execute(
                    f'PRAGMA table_info("{escaped}")'
                )
            ]
            row_count = connection.execute(
                f'SELECT COUNT(*) FROM "{escaped}"'
            ).fetchone()[0]
            preview_column_names = [column["name"] for column in columns]
            preview_rows = [
                dict(zip(preview_column_names, row))
                for row in connection.execute(
                    f'SELECT * FROM "{escaped}" LIMIT {MAX_PREVIEW_ROWS}'
                ).fetchall()
            ]

            table_summaries.append(
                {
                    "name": table_name,
                    "columns": columns,
                    "row_count": row_count,
                    "preview": preview_rows,
                }
            )
            all_preview[table_name] = preview_rows

        return {
            "tables": table_summaries,
            "preview": all_preview,
        }
    finally:
        connection.close()


def _write_dataframe(
    connection: sqlite3.Connection,
    frame: pd.DataFrame,
    table_name: str,
    used_names: set[str],
) -> str:
    frame = _prepare_column_names(_clean_dataframe(frame))
    table_name = _safe_table_name(table_name, used_names)
    column_definitions = ", ".join(
        f'"{str(column).replace(chr(34), chr(34) * 2)}" TEXT'
        for column in frame.columns
    )
    connection.execute(f'CREATE TABLE "{table_name}" ({column_definitions})')

    columns = [
        f'"{str(column).replace(chr(34), chr(34) * 2)}"'
        for column in frame.columns
    ]
    placeholders = ", ".join("?" for _ in columns)
    insert_sql = f'INSERT INTO "{table_name}" ({", ".join(columns)}) VALUES ({placeholders})'
    records = [
        tuple(None if pd.isna(value) else value.item() if hasattr(value, "item") else value for value in row)
        for row in frame.itertuples(index=False, name=None)
    ]
    connection.executemany(insert_sql, records)
    return table_name


def ingest_csv(raw_path: str | Path, database_path: Path) -> dict[str, Any]:
    try:
        frame = pd.read_csv(raw_path)
    except (pd.errors.EmptyDataError, pd.errors.ParserError, UnicodeDecodeError, OSError) as exc:
        raise InvalidDataError("The CSV file is empty or corrupt.", str(exc)) from exc

    connection = sqlite3.connect(database_path)
    try:
        with connection:
            _write_dataframe(connection, frame, "data", set())
    except sqlite3.DatabaseError as exc:
        raise InvalidDataError("Could not load the CSV into SQLite.", str(exc)) from exc
    finally:
        connection.close()
    return _inspect_database(database_path)


def ingest_xlsx(raw_path: str | Path, database_path: Path) -> dict[str, Any]:
    try:
        workbook = load_workbook(raw_path, read_only=True, data_only=True)
    except (OSError, ValueError, KeyError) as exc:
        raise InvalidDataError("The Excel file is empty or corrupt.", str(exc)) from exc

    connection = sqlite3.connect(database_path)
    used_names: set[str] = set()
    imported = 0
    try:
        with connection:
            for sheet_name in workbook.sheetnames:
                sheet = workbook[sheet_name]
                if sheet.max_row < 2 or sheet.max_column < 1:
                    continue
                frame = pd.DataFrame(sheet.iter_rows(values_only=True))
                if frame.empty:
                    continue
                frame.columns = frame.iloc[0].tolist()
                frame = frame.iloc[1:]
                _write_dataframe(connection, frame, sheet_name, used_names)
                imported += 1
    except (InvalidDataError, sqlite3.DatabaseError) as exc:
        raise InvalidDataError(
            "Could not load one or more Excel worksheets.",
            str(exc),
        ) from exc
    finally:
        workbook.close()
        connection.close()

    if imported == 0:
        raise InvalidDataError("The Excel file contains no usable worksheets.")
    return _inspect_database(database_path)


def _split_sql_statements(script: str) -> Iterable[str]:
    statements: list[str] = []
    current: list[str] = []
    quote: str | None = None
    index = 0

    while index < len(script):
        char = script[index]
        if quote:
            current.append(char)
            if char == quote:
                if index + 1 < len(script) and script[index + 1] == quote:
                    current.append(script[index + 1])
                    index += 1
                else:
                    quote = None
            elif quote == "]" and char == "]":
                quote = None
            index += 1
            continue

        if char in ("'", '"', "`"):
            quote = char
            current.append(char)
        elif char == "[":
            quote = "]"
            current.append(char)
        elif script.startswith("--", index):
            newline = script.find("\n", index + 2)
            index = len(script) if newline == -1 else newline
            continue
        elif script.startswith("/*", index):
            end = script.find("*/", index + 2)
            if end == -1:
                raise InvalidDataError("The SQL dump contains an unterminated comment.")
            index = end + 2
            continue
        elif char == ";":
            statement = "".join(current).strip()
            if statement:
                statements.append(statement)
                if len(statements) >= MAX_SQL_STATEMENTS:
                    raise InvalidDataError(
                        f"The SQL dump exceeds the {MAX_SQL_STATEMENTS}-statement limit."
                    )
            current = []
        else:
            current.append(char)
        index += 1

    statement = "".join(current).strip()
    if statement:
        statements.append(statement)
    if len(statements) >= MAX_SQL_STATEMENTS:
        raise InvalidDataError(
            f"The SQL dump exceeds the {MAX_SQL_STATEMENTS}-statement limit."
        )
    if not statements:
        raise InvalidDataError("The SQL dump is empty.")
    return statements


def _allowed_dump_statement(statement: str) -> bool:
    normalized = re.sub(r"\s+", " ", statement).strip().upper()
    prefixes = (
        "CREATE TABLE",
        "CREATE UNIQUE INDEX",
        "CREATE INDEX",
        "INSERT INTO",
        "REPLACE INTO",
        "BEGIN",
        "COMMIT",
        "ROLLBACK",
    )
    return normalized.startswith(prefixes)


def ingest_sql_dump(raw_path: str | Path, database_path: Path) -> dict[str, Any]:
    try:
        script = Path(raw_path).read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise InvalidDataError("The SQL dump must be UTF-8 encoded.") from exc
    except OSError as exc:
        raise InvalidDataError("Could not read the SQL dump.", str(exc)) from exc

    if not script.strip():
        raise InvalidDataError("The SQL dump is empty.")

    connection = sqlite3.connect(database_path)
    try:
        for statement in _split_sql_statements(script):
            if not _allowed_dump_statement(statement):
                raise InvalidDataError(
                    "Unsupported SQL dump statement.",
                    statement[:200],
                )
            connection.execute(statement)
        connection.commit()
    except sqlite3.DatabaseError as exc:
        raise InvalidDataError("The SQL dump is corrupt or incompatible.", str(exc)) from exc
    finally:
        connection.close()
    return _inspect_database(database_path)


def ingest_file(
    raw_path: str | Path,
    database_path: Path | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    path = Path(raw_path)
    suffix = path.suffix.lower()
    if suffix not in (".csv", ".xlsx", ".sql"):
        raise UnsupportedFileError(
            "Unsupported file type. Upload a CSV, XLSX, or SQL file."
        )

    resolved_session = session_id or new_session_id()
    if database_path is None:
        from app.services.lifecycle import database_path as resolve_database_path
        resolved_database = resolve_database_path(resolved_session)
    else:
        resolved_database = Path(database_path)

    resolved_database.parent.mkdir(parents=True, exist_ok=True)
    if resolved_database.exists():
        resolved_database.unlink()

    if suffix == ".csv":
        result = ingest_csv(path, resolved_database)
    elif suffix == ".xlsx":
        result = ingest_xlsx(path, resolved_database)
    else:
        result = ingest_sql_dump(path, resolved_database)

    return {
        "session_id": resolved_session,
        "database_path": str(resolved_database),
        **result,
    }
