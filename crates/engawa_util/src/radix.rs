//! radix encoding for id

pub fn radix_encode(mut num: i64, radix: u32) -> String {
	if num == 0 {
		return "0".to_string();
	}

	let mut result = String::new();

	while num > 0 {
		let digit = (num % radix as i64) as u32;
		result.insert(0, std::char::from_digit(digit, radix).unwrap());

		num /= radix as i64;
	}
	result
}

