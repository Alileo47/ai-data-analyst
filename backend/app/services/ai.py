import json
from typing import Any, Mapping, Sequence

from app.core.config import settings
from app.core.errors import GeminiError


DEFAULT_MODEL = "gemini-2.0-flash"
MAX_EXPLANATION_ROWS = 200
MAX_PROMPT_JSON_CHARS = 100_000

SQL_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "sql": {
            "type": "string",
            "description": "A single read-only SQLite SELECT or WITH query.",
        }
    },
    "required": ["sql"],
}


def _create_client() -> Any:
    if not settings.gemini_api_key:
        raise GeminiError("GEMINI_API_KEY is not configured.")

    try:
        from google import genai

        return genai.Client(api_key=settings.gemini_api_key)
    except ImportError as exc:
        raise GeminiError("The google-genai SDK is not installed.") from exc
    except Exception as exc:
        raise GeminiError("Could not initialize the Gemini client.") from exc


def _generate(client: Any, prompt: str, response_schema: Mapping[str, Any] | None) -> str:
    try:
        from google.genai import types

        config_kwargs: dict[str, Any] = {}
        if response_schema is not None:
            config_kwargs.update(
                {
                    "response_mime_type": "application/json",
                    "response_schema": dict(response_schema),
                }
            )

        response = client.models.generate_content(
            model=DEFAULT_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(**config_kwargs),
        )
        text = getattr(response, "text", None)
        if not isinstance(text, str) or not text.strip():
            raise GeminiError("Gemini returned an empty response.")
        return text.strip()
    except GeminiError:
        raise
    except Exception as exc:
        raise GeminiError("Gemini could not complete the request.") from exc


def generate_sql(table_schemas: Sequence[Mapping[str, Any]], question: str) -> str:
    if not isinstance(question, str) or not question.strip():
        raise GeminiError("A user question is required.")
    if not isinstance(table_schemas, Sequence) or isinstance(table_schemas, (str, bytes)):
        raise GeminiError("Table schemas must be supplied as a list.")

    bounded_schemas = list(table_schemas)
    schemas_json = json.dumps(bounded_schemas, ensure_ascii=False, default=str)
    if len(schemas_json) > MAX_PROMPT_JSON_CHARS:
        raise GeminiError("Table schemas exceed the prompt size limit.")

    prompt = (
        "You convert a natural-language question into exactly one SQLite read-only query.\n"
        "Use only the supplied table schemas. Never invent tables or columns.\n"
        "Return only JSON matching the required object shape.\n"
        "Do not use markdown, code fences, comments, or explanatory text.\n"
        "The SQL must be one statement starting with SELECT or WITH.\n"
        "It must not contain DROP, DELETE, UPDATE, INSERT, ALTER, ATTACH, PRAGMA, "
        "VACUUM, REPLACE, CREATE, or multiple statements.\n"
        "Use SQLite syntax exclusively.\n\n"
        "TABLE_SCHEMAS (JSON):\n"
        f"{schemas_json}\n\n"
        "USER_QUESTION:\n"
        f"{question.strip()}\n"
    )

    response_text = _generate(_create_client(), prompt, SQL_RESPONSE_SCHEMA)
    if response_text.startswith("```") or "```" in response_text:
        raise GeminiError("Gemini returned markdown instead of structured JSON.")

    try:
        parsed = json.loads(response_text)
    except json.JSONDecodeError as exc:
        raise GeminiError("Gemini returned malformed JSON.") from exc

    if not isinstance(parsed, dict) or set(parsed) != {"sql"}:
        raise GeminiError("Gemini returned an invalid SQL response object.")

    sql = parsed.get("sql")
    if not isinstance(sql, str) or not sql.strip():
        raise GeminiError("Gemini returned an empty SQL query.")
    if "```" in sql:
        raise GeminiError("Gemini returned a markdown SQL code fence.")
    return sql.strip()


def explain_results(
    question: str,
    executed_sql: str,
    column_names: Sequence[str],
    actual_results: Sequence[Mapping[str, Any]],
) -> str:
    if not isinstance(question, str) or not question.strip():
        raise GeminiError("A user question is required.")
    if not isinstance(executed_sql, str) or not executed_sql.strip():
        raise GeminiError("An executed SQL query is required.")
    if not isinstance(column_names, Sequence) or isinstance(column_names, (str, bytes)):
        raise GeminiError("Column names must be supplied as a list.")
    if not isinstance(actual_results, Sequence) or isinstance(actual_results, (str, bytes)):
        raise GeminiError("Actual query results must be supplied as a list.")

    bounded_rows = list(actual_results[:MAX_EXPLANATION_ROWS])
    bounded_columns = list(column_names)
    results_json = json.dumps(bounded_rows, ensure_ascii=False, default=str)
    if len(results_json) > MAX_PROMPT_JSON_CHARS:
        raise GeminiError("Actual query results exceed the prompt size limit.")

    prompt = (
        "Explain the actual database query result in concise plain English.\n"
        "Use only the supplied question, executed SQL, column names, and returned rows.\n"
        "Do not invent fields, values, trends, or conclusions not supported by the rows.\n"
        "If the rows are empty, state that no matching rows were found.\n"
        "Do not return SQL or markdown; return only the explanation.\n\n"
        "USER_QUESTION:\n"
        f"{question.strip()}\n\n"
        "EXECUTED_SQL:\n"
        f"{executed_sql.strip()}\n\n"
        "COLUMN_NAMES (JSON):\n"
        f"{json.dumps(bounded_columns, ensure_ascii=False)}\n\n"
        "ACTUAL_RESULTS (JSON):\n"
        f"{results_json}\n"
    )

    explanation = _generate(_create_client(), prompt, None)
    if "```" in explanation:
        raise GeminiError("Gemini returned markdown in the explanation.")
    return explanation
