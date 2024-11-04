use vapid::Key;

pub(crate) struct VapidKey {
	pub private_key: String,
	pub public_key: String,
}

#[derive(thiserror::Error, Debug)]
#[error("Error while generating VAPID key: {0}")]
pub(crate) struct VapidError(String);

pub(crate) fn gen_vapid_key() -> Result<VapidKey, VapidError> {
	let keypair = Key::generate().map_err(|e| VapidError(e.to_string()))?;
	Ok(VapidKey {
			private_key: keypair.to_private_raw(),
			public_key: keypair.to_public_raw(),
	})
}
