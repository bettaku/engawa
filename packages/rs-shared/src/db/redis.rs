use crate::config::CONFIG;
use async_trait::async_trait;
use bb8::{ManageConnection, Pool, PooledConnection, RunError};
use redis::{aio::MultiplexedConnection, Client, ErrorKind, IntoConnectionInfo, RedisError};
use tokio::sync::OnceCell;

static REDIS_CONN: OnceCell<Pool<RedisConnectionManager>> = OnceCell::const_new();

#[derive(Clone, Debug)]
pub struct RedisConnectionManager {
	client: Client,
}

impl RedisConnectionManager {
	pub fn new<T: IntoConnectionInfo>(info: T) -> Result<Self, RedisError> {
		Ok(Self {
			client: Client::open(info.into_connection_info()?)?,
		})
	}
}

#[async_trait]
impl ManageConnection for RedisConnectionManager {
	type Connection = MultiplexedConnection;
	type Error = RedisError;

	async fn connect(&self) -> Result<Self::Connection, Self::Error> {
		self.client.get_multiplexed_async_connection().await
	}

	async fn is_valid(&self, conn: &mut Self::Connection) -> Result<(), Self::Error> {
		let pong: String = redis::cmd("PING").query_async(conn).await?;

		match pong.as_str() {
			"PONG" => Ok(()),
			_ => Err((ErrorKind::ResponseError, "ping request").into()),
		}
	}

	fn has_broken(&self, _: &mut Self::Connection) -> bool {
		false
	}
}

pub async fn init_redis_conn() -> Result<(), RedisError> {
	let redis_uri = {
		let mut params = vec![
			"redis://".to_owned(),
		];

		let redis = if let Some(redis) = &CONFIG.redis {
			redis
		} else {
			&CONFIG.redis
		};
	};

	Ok(())
}
