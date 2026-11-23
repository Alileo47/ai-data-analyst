import pytest

from app.core.sqlite_safety import UnsafeSQLError, validate_read_only_sql


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT * FROM users",
        "WITH active AS (SELECT * FROM users) SELECT * FROM active",
        "SELECT 'DROP TABLE users' AS text",
        "SELECT 1;",
        "SELECT 1; -- trailing comment",
    ],
)
def test_allows_single_read_only_query(sql):
    assert validate_read_only_sql(sql)


@pytest.mark.parametrize(
    "sql",
    [
        "DROP TABLE users",
        "DELETE FROM users",
        "UPDATE users SET name = 'Ada'",
        "INSERT INTO users(name) VALUES ('Ada')",
        "ALTER TABLE users ADD COLUMN age INTEGER",
        "ATTACH DATABASE 'other.db' AS other",
        "PRAGMA table_info(users)",
        "VACUUM",
        "SELECT 1; SELECT 2",
        "SELECT 1; DELETE FROM users",
        "WITH deleted AS (DELETE FROM users RETURNING *) SELECT * FROM deleted",
        "/* comment */; SELECT 1",
        "/* first */ SELECT 1; /* trailing */ SELECT 2",
    ],
)
def test_blocks_unsafe_queries(sql):
    with pytest.raises(UnsafeSQLError):
        validate_read_only_sql(sql)
