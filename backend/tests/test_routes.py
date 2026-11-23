from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.errors import GeminiError
from app.services import ai
from main import app


client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_upload_csv():
    response = client.post(
        "/upload",
        files={"file": ("people.csv", b"name,age\nAda,30\n", "text/csv")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["session_id"]
    assert body["tables"][0]["name"] == "data"
    assert body["preview"]


def test_upload_rejects_unsupported_extension():
    response = client.post(
        "/upload",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 415
    assert response.json()["error"]["code"] == "UNSUPPORTED_FILE"


def test_upload_rejects_empty_file():
    response = client.post(
        "/upload",
        files={"file": ("empty.csv", b"", "text/csv")},
    )
    assert response.status_code == 400


def test_upload_rejects_file_over_20_mb():
    response = client.post(
        "/upload",
        files={
            "file": (
                "large.csv",
                b"name\n" + (b"x" * (20 * 1024 * 1024)),
                "text/csv",
            )
        },
    )
    assert response.status_code == 413


def test_ask_expired_session():
    response = client.post(
        "/ask",
        json={
            "session_id": "00000000-0000-0000-0000-000000000099",
            "question": "Show all rows",
        },
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] in ("NOT_FOUND", "SESSION_EXPIRED")


def test_generate_sql_rejects_malformed_json(monkeypatch):
    monkeypatch.setattr(ai, "_create_client", lambda: object())
    monkeypatch.setattr(ai, "_generate", lambda *_args: "not json")

    with pytest.raises(GeminiError):
        ai.generate_sql([], "Show all rows")


def test_generate_sql_rejects_markdown(monkeypatch):
    monkeypatch.setattr(ai, "_create_client", lambda: object())
    monkeypatch.setattr(
        ai,
        "_generate",
        lambda *_args: "```json\n{\"sql\":\"SELECT 1\"}\n```",
    )

    with pytest.raises(GeminiError):
        ai.generate_sql([], "Show one row")
