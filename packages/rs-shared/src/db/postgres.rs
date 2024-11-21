use crate::config::CONFIG;
use sea_orm::{ConnectOptions, Database, DbConn, DbErr};
use tokio::sync::OnceCell;
use tracing::log::LevelFilter;

static DB_CONN: OnceCell<DbConn> = OnceCell::const_new();

pub async fn init_conn() -> Result<&'static DbConn, DbErr> {
	let db_uri = format!(
		"postgres://{}:{}@{}:{}/{}",
		CONFIG.db.user,
		urlencoding::encode(&CONFIG.db.pass),
		CONFIG.db.host,
		CONFIG.db.port,
		CONFIG.db.db,
	);

	let opts: ConnectOptions = ConnectOptions::new(db_uri)
		.sqlx_logging_level(LevelFilter::Trace)
		.to_owned();

	let conn = DB_CONN
		.get_or_try_init(|| async {
			tracing::info!("Initializing database connection...");
			Database::connect(opts).await
		})
		.await?;

		Ok(conn)
}

pub async fn get_conn() -> Result<&'static DbConn, DbErr> {
	match DB_CONN.get() {
		Some(conn) => Ok(conn),
		None => init_conn().await,
	}
}
