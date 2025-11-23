//! show server stats

use sysinfo::{IS_SUPPORTED_SYSTEM, System};

pub async fn show_machine_info() {
    if !IS_SUPPORTED_SYSTEM {
        tracing::warn!("This machine is not supported by library");
        return;
    }

    let mut sys = System::new_all();
    sys.refresh_all();

    tracing::info!(
        "Host: {}",
        System::host_name().unwrap_or_else(|| "Unsupported".to_owned())
    );

    tracing::info!("")
}
