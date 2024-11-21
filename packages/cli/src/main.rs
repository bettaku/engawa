use clap::{Args, Subcommand, Parser};
use rs_shared::util::{id, vapid};

#[derive(Parser)]
#[command(name = "notectl", version, next_line_help = true, propagate_version = true )]
#[command(about = "A CLI for managing CherryPick", long_about = None )]
struct Cli {
	#[command(subcommand)]
	command: Commands,
}

#[derive(Subcommand)]
enum Commands {
	Parse(ParseArgs),
	Vapid,
}

#[derive(Args)]
struct ParseArgs {
	#[arg(required = true, short = 'i', long = "id-type")]
	id_type: String,

	#[arg(required = true)]
	id: String,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

		match &cli.command {
			Commands::Parse(args) => {
				match args.id_type.as_str() {
					"aidx" | "aid" => {
						println!("Timestamp: {:?}", id::get_timestamp_from_aidx(&args.id));
					}
					"ulid" => {
						println!("Timestamp: {:?}", id::get_timestamp_from_ulid(&args.id));
					}
					_ => {
						eprintln!("Invalid ID Type: {}", args.id_type);
					}
				}
			}
			Commands::Vapid => {
				match vapid::gen_vapid_key() {
					Ok(key) => {
						println!("Private Key: {}", key.private_key);
						println!("Public Key: {}", key.public_key);
					}
					Err(e) => {
						eprintln!("Error: {}", e);
					}
				}
			}
		}
}
