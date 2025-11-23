//! aidx
//!

use regex::Regex;

use crate::radix;

const TIME2000: u64 = 946684800000;
const NODE_LENGTH: usize = 4;
const NOISE_LENGTH: usize = 4;

static COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

