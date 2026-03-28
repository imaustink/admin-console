// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Disable GPU compositing and DMA-BUF renderer — required on Pi 4 / ARM
    // hardware where WebKit GPU paths cause rendering corruption.
    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

    homelab_dashboard_lib::run();
}
