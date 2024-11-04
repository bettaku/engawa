use std::{env, fs};
use std::path::Path;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServerConfig {
    // Publish Tarball
    pub publish_tarball: Option<bool>,
    // URL
    pub url: String,
    // Port and TLS Settings
    pub port: u16,
    pub socket: Option<String>,
    pub chmod_socket: Option<u16>,

    // PostgreSQL Configuration
    pub db: DbConfig,
    pub db_replications: Option<bool>,
    pub db_slaves: Option<Vec<DbConfig>>,

    // Redis Configuration
    pub redis: RedisConfig,
    pub redis_for_pubsub: Option<RedisConfig>,
    pub redis_for_jobqueue: Option<RedisConfig>,
    pub redis_for_timelines: Option<RedisConfig>,
    pub redis_for_reactions: Option<RedisConfig>,

    // Meilisearch Configuration
    pub meilisearch: Option<MeilisearchConfig>,
		// Elasticsearch Configuration for engawa
		pub elasticsearch: Option<ElasticsearchConfig>,
}

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DbConfig {
    pub host: String,
    pub port: u16,

    // Database name
    pub db: String,

    // Auth
    pub user: String,
    pub pass: String,

    //  Option
    pub disable_cache: Option<bool>,
    pub extra: Option<DbExtraConfig>,
}

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DbExtraConfig {
    pub ssl: bool,
}

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RedisConfig {
    pub host: String,
    pub port: u16,
    pub family: Option<u8>,
    pub pass: Option<String>,
    pub db: Option<u8>,
    pub username: Option<String>,
}

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MeilisearchConfig {
    pub host: String,
    pub port: u16,
    pub api_key: String,
    pub ssl: bool,
    pub index: String,
    pub scope: SearchEngineScopeEnum,
}

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ElasticsearchConfig {
	pub host: String,
	pub port: u16,
	pub user: String,
	pub pass: String,
	pub ssl: bool,
	pub index: String,
	pub reject_unauthorized: bool,
	pub scope: SearchEngineScopeEnum,
	pub ping_timeout: u64,
	pub request_timeout: u64,
}

#[derive(Deserialize, Serialize, Debug)]
pub(crate) enum SearchEngineScopeEnum {
    Local,
    Global,
    Custom(Vec<String>),
}
// TODO: スコープのimplを実装する

pub(crate) struct Config {
    // Publish Tarball
    pub publish_tarball: Option<bool>,
    // URL
    pub url: String,
    // Port and TLS Settings
    pub port: u16,
    pub socket: Option<String>,
    pub chmod_socket: Option<u16>,

    // PostgreSQL Configuration
    pub db: DbConfig,
    pub db_replications: Option<bool>,
    pub db_slaves: Option<Vec<DbConfig>>,

    // Redis Configuration
    pub redis: RedisConfig,
    pub redis_for_pubsub: Option<RedisConfig>,
    pub redis_for_jobqueue: Option<RedisConfig>,
    pub redis_for_timelines: Option<RedisConfig>,
    pub redis_for_reactions: Option<RedisConfig>,

    // Meilisearch Configuration
    pub meilisearch: Option<MeilisearchConfig>,
}

fn read_config_file() -> ServerConfig {
	let cwd = env::current_dir().unwrap();
    let yml = fs::File::open(cwd.join("../.config/default.yml")).expect("Failed to open config file");
    let mut data : ServerConfig = serde_yml::from_reader(yml).expect("Failed to parse config file");

    data.url = url::Url::parse(&data.url).expect("Invalid URL Schema").origin().ascii_serialization();

    data
}

pub(crate) fn load_config() -> Config {
    let server_config = read_config_file();

    Config {
        publish_tarball: server_config.publish_tarball,
        url: server_config.url,
        port: server_config.port,
        socket: server_config.socket,
        chmod_socket: server_config.chmod_socket,
        db: server_config.db,
        db_replications: server_config.db_replications,
        db_slaves: server_config.db_slaves,
        redis: server_config.redis,
        redis_for_pubsub: server_config.redis_for_pubsub,
        redis_for_jobqueue: server_config.redis_for_jobqueue,
        redis_for_timelines: server_config.redis_for_timelines,
        redis_for_reactions: server_config.redis_for_reactions,
        meilisearch: server_config.meilisearch,
    }
}

pub static CONFIG: Lazy<Config> = Lazy::new(load_config);
