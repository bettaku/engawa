//! Redis cache implementation

use redis::AsyncTypedCommands;
use serde::{Serialize, de::DeserializeOwned};

pub struct RedisKVCache<T> {
    name: String,
    redis_client: redis::Client,
    memory_cache: moka::future::Cache<String, T>,
    lifetime: std::time::Duration,
}

impl<T> RedisKVCache<T>
where
    T: Clone + Send + Sync + Serialize + DeserializeOwned + 'static,
{
    pub fn new() {
        todo!()
    }

    pub async fn delete(&self, key: &str) -> Result<(), Box<dyn std::error::Error>> {
        self.memory_cache.invalidate(key).await;

        let mut conn = self.redis_client.get_multiplexed_async_connection().await?;
        let redis_key = format!("kvcache:{}:{}", self.name, key);
        conn.del(&redis_key).await?;

        Ok(())
    }
}
