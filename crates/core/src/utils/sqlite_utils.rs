use itertools::Itertools;
use rusqlite::Connection;

#[derive(Clone, Debug, Default, PartialEq, Eq, Hash)]
pub enum JoinType {
    Inner,
    #[default]
    Left,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum SelectExpr {
    /// SELECT `<table_alias>.<expr>`
    Trivial(String),
    /// SELECT `<expr>`
    Custom(String),
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Hash)]
pub struct JoinTable {
    pub table_name: String,
    pub table_alias: Option<String>,
    pub selects: Vec<SelectExpr>,
    /// ON `<table_alias>.<expr>`
    pub join_expr_suffix: String,
    pub join_type: JoinType,
}

impl JoinTable {
    fn alias(&self) -> &str {
        self.table_alias.as_deref().unwrap_or(&self.table_name)
    }
}

/// Make a simple-ish SQL query with joins.
///
/// # Params
/// - `select`: the initial SELECT part, without the FROM. E.g. "SELECT id, name"
/// - `from_and_join`: the FROM part as necessary explicit JOINs
/// - `outro`: the rest of the query, e.g. "WHERE ... ORDER BY ...". Can be empty.
/// - `joins`: self-explanatory
pub fn make_join_sql(
    select: &str,
    from_and_join: &str,
    outro: &str,
    joins: &[JoinTable],
) -> String {
    let additional_columns_select = joins
        .iter()
        .map(|join| {
            join.selects
                .iter()
                .map(|s| match s {
                    SelectExpr::Trivial(expr) => format!("{}.{expr}", join.alias()),
                    SelectExpr::Custom(expr) => expr.clone()
                })
                .join(", ")
        })
        .filter(|s| !s.is_empty())
        .join(",\n");

    let select_part_1 = [select, &additional_columns_select]
        .into_iter()
        .filter(|s| !s.is_empty())
        .join(", ");

    let additional_joins = joins
        .iter()
        .map(|join| {
            let join_type_str = match join.join_type {
                JoinType::Inner => "INNER",
                JoinType::Left => "LEFT",
            };
            format!(
                "{} JOIN {} AS {} ON {}.{}",
                join_type_str, join.table_name, join.alias(), join.alias(), join.join_expr_suffix
            )
        })
        .join("\n");

    format!("{select_part_1}\n{from_and_join}\n{additional_joins}\n{outro}")
}

pub fn table_exists(conn: &Connection, table_name: &str) -> bool {
    let count: u32 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
            [table_name],
            |row| row.get(0),
        )
        .expect("failed to check for table existence, SQL syntax error?");

    count > 0
}
