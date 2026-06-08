use rusqlite::Connection;

pub fn table_exists(conn: &Connection, table_name: &str) -> bool {
    let count: u32 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
        [table_name],
        |row| row.get(0),
    )
        .expect("failed to check for table existence, SQL syntax error?");

    count > 0
}
