from pathlib import Path

import pytest
from openpyxl import Workbook

from app.core.errors import InvalidDataError, UnsupportedFileError
from app.services.ingestion import ingest_file
from app.services.lifecycle import delete_raw_upload


def test_ingests_csv(tmp_path):
    csv_path = tmp_path / "people.csv"
    csv_path.write_text("name,age\nAda,30\nBob,\n", encoding="utf-8")
    database_path = tmp_path / "00000000-0000-0000-0000-000000000001.db"

    result = ingest_file(csv_path, database_path)

    assert result["session_id"]
    assert result["tables"][0]["name"] == "data"
    assert result["tables"][0]["row_count"] == 2
    assert len(result["tables"][0]["preview"]) == 2


def test_ingests_xlsx(tmp_path):
    excel_path = tmp_path / "people.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "People"
    sheet.append(["name", "age"])
    sheet.append(["Ada", 30])
    workbook.save(excel_path)

    result = ingest_file(
        excel_path,
        tmp_path / "00000000-0000-0000-0000-000000000002.db",
    )

    assert result["tables"][0]["name"] == "People"
    assert result["tables"][0]["row_count"] == 1


def test_ingests_sql_dump(tmp_path):
    sql_path = tmp_path / "dump.sql"
    sql_path.write_text(
        "CREATE TABLE items(id INTEGER, name TEXT); "
        "INSERT INTO items VALUES (1, 'Pen'); "
        "INSERT INTO items VALUES (2, 'Book');",
        encoding="utf-8",
    )

    result = ingest_file(
        sql_path,
        tmp_path / "00000000-0000-0000-0000-000000000003.db",
    )

    assert result["tables"][0]["name"] == "items"
    assert result["tables"][0]["row_count"] == 2


@pytest.mark.parametrize("filename,content", [
    ("empty.csv", b""),
    ("corrupt.csv", b"\xff\xfe\xfa\xfb"),
    ("unsupported.txt", b"hello"),
])
def test_rejects_empty_corrupt_or_unsupported_files(tmp_path, filename, content):
    path = tmp_path / filename
    path.write_bytes(content)

    with pytest.raises((InvalidDataError, UnsupportedFileError)):
        ingest_file(path, tmp_path / "00000000-0000-0000-0000-000000000004.db")


def test_rejects_oversized_csv_before_ingestion(tmp_path):
    path = tmp_path / "large.csv"
    path.write_text("value\n" + ("a\n" * 300_000), encoding="utf-8")
    with pytest.raises(InvalidDataError):
        ingest_file(
            path,
            tmp_path / "00000000-0000-0000-0000-000000000005.db",
        )


def test_raw_upload_cleanup(tmp_path):
    raw_path = tmp_path / "raw.csv"
    raw_path.write_text("name\nAda\n", encoding="utf-8")

    delete_raw_upload(raw_path)

    assert not raw_path.exists()
