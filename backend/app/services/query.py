import sqlite3
from pathlib import Path
from typing import Any, Sequence
import re

from app.core.errors import (
    BadRequestError,
    SQLExecutionError,
    UnsafeSQLError as DomainUnsafeSQLError,
)
from app.core.sqlite_safety import (
    execute_read_only,
    open_readonly_sqlite,
    UnsafeSQLError as SQLiteUnsafeSQLError,
)
from app.services.lifecycle import touch_session, verify_active_session


MAX_RESULT_ROWS = 1_000
MAX_SEARCH_ROWS = 500


def _quote_identifier(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _search_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).casefold()


def search_session(
    session_id: str,
    query: str,
    column: str | None = None,
) -> dict[str, Any]:
    database_path = verify_active_session(session_id, touch=True)
    if not isinstance(query, str) or not query.strip():
        raise BadRequestError("Search query cannot be empty.")

    search_query = query.strip()
    terms = [term for term in re.findall(r"\S+", search_query) if term]
    escaped_terms = [_escape_like(term) for term in terms]

    connection = open_readonly_sqlite(database_path)
    try:
        table_names = [
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

        requested_table: str | None = None
        requested_column: str | None = None
        if column:
            stripped = column.strip()
            if "." in stripped:
                parts = stripped.split(".", 1)
                requested_table, requested_column = parts[0], parts[1]
            else:
                requested_column = stripped

        matches: list[tuple[int, dict[str, Any]]] = []
        matching_columns: list[str] = []
        seen_columns: set[str] = set()

        for table_name in table_names:
            if requested_table and table_name.casefold() != requested_table.casefold():
                continue

            schema_cursor = connection.execute(
                f"SELECT * FROM {_quote_identifier(table_name)} LIMIT 0"
            )
            available_columns = [
                description[0] for description in (schema_cursor.description or [])
            ]

            if requested_column:
                selected_columns = [
                    name
                    for name in available_columns
                    if name.casefold() == requested_column.casefold()
                ]
                if not selected_columns:
                    continue
            else:
                selected_columns = available_columns

            if not selected_columns:
                continue

            predicates: list[str] = []
            parameters: list[Any] = []
            for column_name in selected_columns:
                quoted_column = _quote_identifier(column_name)
                for escaped_term in escaped_terms:
                    predicates.append(
                        f"CAST({quoted_column} AS TEXT) "
                        f"LIKE ? ESCAPE '\\'"
                    )
                    parameters.append(f"%{escaped_term}%")

            if not predicates:
                continue

            select_columns = ", ".join(
                _quote_identifier(name) for name in available_columns
            )
            sql = (
                f"SELECT {select_columns} "
                f"FROM {_quote_identifier(table_name)} "
                f"WHERE {' OR '.join(predicates)} "
                f"LIMIT {MAX_SEARCH_ROWS + 1}"
            )
            cursor = connection.execute(sql, parameters)
            result_columns = available_columns
            fetched = cursor.fetchall()

            for result_row in fetched[:MAX_SEARCH_ROWS]:
                row_dict = dict(zip(result_columns, result_row))
                searchable = " ".join(
                    _search_text(row_dict[name]) for name in selected_columns
                )

                exact = any(
                    _search_text(row_dict[name]) == search_query.casefold()
                    for name in selected_columns
                    if row_dict[name] is not None
                )
                prefix = any(
                    _search_text(row_dict[name]).startswith(search_query.casefold())
                    for name in selected_columns
                    if row_dict[name] is not None
                )
                contains = any(
                    search_query.casefold() in _search_text(row_dict[name])
                    for name in selected_columns
                    if row_dict[name] is not None
                )
                all_terms = all(term.casefold() in searchable for term in terms)

                if exact:
                    rank = 0
                elif prefix:
                    rank = 1
                elif contains:
                    rank = 2
                elif all_terms:
                    rank = 3
                else:
                    continue

                matches.append((rank, row_dict))
                for column_name in selected_columns:
                    if column_name not in seen_columns:
                        seen_columns.add(column_name)
                        matching_columns.append(column_name)
    except sqlite3.Error as exc:
        raise SQLExecutionError("The search query could not be executed.", str(exc)) from exc
    finally:
        connection.close()

    matches.sort(key=lambda item: item[0])
    rows = [row for _, row in matches[:MAX_SEARCH_ROWS]]
    if requested_column and not matching_columns:
        raise BadRequestError(
            f"Column '{requested_column}' was not found in the uploaded tables."
        )

    return {
        "columns": matching_columns,
        "rows": rows,
        "is_empty": len(rows) == 0,
        "truncated": len(matches) > MAX_SEARCH_ROWS,
    }


def execute_session_query(
    session_id: str,
    sql: str,
    parameters: Sequence[Any] | None = None,
) -> dict[str, Any]:
    database_path = verify_active_session(session_id, touch=False)
    bounded_sql = (
        f"WITH __bounded AS ({sql}) "
        f"SELECT * FROM __bounded LIMIT {MAX_RESULT_ROWS + 1}"
    )
    try:
        columns, rows = execute_read_only(database_path, bounded_sql, parameters)
    except SQLiteUnsafeSQLError as exc:
        raise DomainUnsafeSQLError(str(exc)) from exc
    except sqlite3.Error as exc:
        raise SQLExecutionError("The SQL query could not be executed.", str(exc)) from exc

    bounded_rows = rows[:MAX_RESULT_ROWS]
    touch_session(database_path)
    return {
        "columns": columns,
        "rows": bounded_rows,
        "is_empty": len(bounded_rows) == 0,
        "row_count": len(bounded_rows),
        "truncated": len(rows) > MAX_RESULT_ROWS,
    }
