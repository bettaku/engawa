//! PostgreSQL connection
use sea_orm::{ConnectOptions, Database, DbConn, DbErr, sqlx::postgres::PgConnectOptions};

async fn init_conn() -> Result<DbConn, DbErr> {
    let mut opt = ConnectOptions::new("postgres://postgres:postgres@localhost:5432/postgres");

    let db = Database::connect(opt).await?;
    Ok(db)
}
