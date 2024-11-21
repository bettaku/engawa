use basen::BASE36;
use std::str::FromStr;
use rusty_ulid::{Ulid, DecodingError};

const TIME2000: i64 = 946_684_800_000;

#[derive(thiserror::Error, Debug)]
#[error("'Invalid ID Format: '{id}'")]
pub struct InvalidIdError {
	id: String,
}

impl From<DecodingError> for InvalidIdError {
	fn from(error: DecodingError) -> Self {
		InvalidIdError { id: format!("Invalid ID Format: '{:?}'", error)}
	}
}

pub fn get_timestamp_from_aidx(id: &str) -> Result<i64, InvalidIdError> {
	let n: Option<u64> = BASE36.decode_var_len(&id[0..8]);
	if let Some(n) = n {
		Ok(n as i64 + TIME2000)
	} else {
		Err(InvalidIdError { id: id.to_owned() })
	}
}

pub fn get_timestamp_from_ulid(id: &str) -> Result<i64, InvalidIdError> {
	let ulid: Ulid = Ulid::from_str(&id)?;
	let timestamp = ulid.timestamp();
	Ok(timestamp as i64)
}
