use std::path::PathBuf;
use anyhow::{Context, Result};
use crate::types::AppConfig;

/// Locate and load config.json.
///
/// Search order:
/// 1. `CONFIG_PATH` env var (explicit override)
/// 2. Dev mode: `<workspace>/config.json` (parent of the executable / project root)
/// 3. Production: `<app_data>/config.json`  (seeded from bundled `config.example.json` on first run)
pub fn load_config() -> Result<AppConfig> {
    let config_path = resolve_config_path()?;
    tracing::info!("Loading config from {:?}", config_path);

    let raw = std::fs::read_to_string(&config_path)
        .with_context(|| format!("Failed to read config at {:?}", config_path))?;

    let config: AppConfig =
        serde_json::from_str(&raw).with_context(|| "Failed to parse config.json")?;

    Ok(config)
}

fn resolve_config_path() -> Result<PathBuf> {
    // 1. Explicit override
    if let Ok(path) = std::env::var("CONFIG_PATH") {
        return Ok(PathBuf::from(path));
    }

    // 2. Dev mode: look next to the binary / two directories up (project root)
    //    Works for `cargo run` where the binary is in target/debug/
    let dev_path = {
        let exe = std::env::current_exe().unwrap_or_default();
        // target/debug/homelab-dashboard -> project root is 3 levels up
        exe.ancestors().nth(3).unwrap_or_else(|| std::path::Path::new(".")).join("config.json")
    };

    if dev_path.exists() {
        return Ok(dev_path);
    }

    // Also check CWD (useful during dev)
    let cwd_path = std::env::current_dir().unwrap_or_default().join("config.json");
    if cwd_path.exists() {
        return Ok(cwd_path);
    }

    // 3. Production: app data dir
    if let Some(data_dir) = dirs::data_dir() {
        let app_dir = data_dir.join("homelab-dashboard");
        std::fs::create_dir_all(&app_dir).ok();

        let prod_path = app_dir.join("config.json");

        // Seed from bundled example on first run
        if !prod_path.exists() {
            let example = PathBuf::from("config.example.json");
            if example.exists() {
                std::fs::copy(&example, &prod_path).ok();
                tracing::info!("Seeded config from example: {:?}", prod_path);
            }
        }

        return Ok(prod_path);
    }

    anyhow::bail!("Could not locate config.json — set CONFIG_PATH env var or place it in the project root")
}
