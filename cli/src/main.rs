mod config;
mod db;
mod util;

fn main() {
    println!("{}", config::CONFIG.url);
		println!("{:?}", util::id::get_timestamp_from_aidx("9e112pilk1"));
		println!("{:?}", util::id::get_timestamp_from_aidx("a0598efdx45b002k"));
		println!("{:?}", util::id::get_timestamp_from_ulid("01JBS70109K8AWXZX5C9WH248H"));
}
