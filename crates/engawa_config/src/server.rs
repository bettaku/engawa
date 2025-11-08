// Server Configuration module

use std::{fs, path::Path, sync::RwLock};

use serde::{Deserialize, Serialize};
use thiserror::Error;

static CONFIG: once_cell::sync::OnceCell<RwLock<BackendConfig>> = once_cell::sync::OnceCell::new();

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendConfig {
	pub url: String,
	pub port: u64,
	pub db: DbConfig,
	pub redis: RedisConfig,
	pub id: IdMethod,
	pub search_provider: SearchProvider,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbConfig {
	pub host: String,
	pub port: u64,
	pub db: String,
	pub user: String,
	pub pass: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisConfig {
	pub host: String,
	pub port: u16,

	#[serde(default)]
	pub username: Option<String>,

	#[serde(default)]
	pub pass: Option<String>,

	#[serde(default)]
	pub db: Option<u8>,

	#[serde(default)]
	pub prefix: Option<String>,

	#[serde(default)]
	pub pubsub: Option<Box<RedisInstanceConfig>>,

	#[serde(default)]
	pub queue: Option<Box<RedisInstanceConfig>>,

	#[serde(default)]
	pub timeline: Option<Box<RedisInstanceConfig>>,

	#[serde(default)]
	pub reactions: Option<Box<RedisInstanceConfig>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisInstanceConfig {
	pub host: String,
	pub port: u16,

	#[serde(default)]
	pub username: Option<String>,

	#[serde(default)]
	pub pass: Option<String>,

	#[serde(default)]
	pub db: Option<u8>,

	#[serde(default)]
	pub prefix: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IdMethod {
	Aid, // deprecated
	Aidx,
	Meid, // deprecated
	Ulid,
	Objectid, // deprecated
	Snowflake,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SearchProvider {
	Postgres,
	Meilisearch,
	Elasticsearch
}

#[derive(Debug, Error)]
pub enum ConfigError {
	#[error("File not found: {path}")]
	ConfigFileNotFound { path: String },

	#[error("Failed to read config file: {0}")]
	IoError(#[from] std::io::Error),

	#[error("Failed to parse config: {0}")]
	ParseError(#[from] toml::de::Error),

	#[error("Initialization error")]
	ConfigInitError,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Config;

impl Config {
	pub fn init() -> Result<(), ConfigError> {
		dotenvy::from_filename(".env.production").ok();
		dotenvy::dotenv().ok();
		let path = std::env::var("CONFIG_PATH").unwrap();
		let config = Self::load_from_toml(path)?;
		CONFIG
			.set(RwLock::new(config))
			.map_err(|_| ConfigError::ConfigInitError)
	}

	fn load_from_toml<P: AsRef<Path>>(path: P) -> Result<BackendConfig, ConfigError> {
		let content = std::fs::read_to_string(path)?;
		let config = toml::from_str(&content)?;
		Ok(config)
	}
}

