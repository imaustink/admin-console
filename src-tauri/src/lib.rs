mod config;
mod controllers;
mod mock;
mod state;
mod types;

use tauri::State;
use tracing::{error, info};

use state::AppState;
use types::*;

// ─── Error helper ─────────────────────────────────────────────────────────────

type CmdResult<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    error!("{}", e);
    e.to_string()
}

fn mock_mode() -> bool {
    std::env::var("MOCK_MODE").map(|v| v == "1" || v == "true").unwrap_or(false)
}

// ─── UniFi commands ───────────────────────────────────────────────────────────

#[tauri::command]
async fn unifi_get_devices(state: State<'_, AppState>) -> CmdResult<Vec<UnifiDevice>> {
    info!("unifi_get_devices called");
    if mock_mode() { return Ok(mock::unifi_devices()); }
    let mut unifi = state.unifi.lock().await;
    unifi.get_devices().await.map_err(err)
}

#[tauri::command]
async fn unifi_get_internet_stats(state: State<'_, AppState>) -> CmdResult<InternetStats> {
    info!("unifi_get_internet_stats called");
    if mock_mode() { return Ok(mock::internet_stats()); }
    let mut unifi = state.unifi.lock().await;
    unifi.get_internet_stats().await.map_err(err)
}

#[tauri::command]
async fn unifi_power_cycle(device_id: String, state: State<'_, AppState>) -> CmdResult<()> {
    info!("unifi_power_cycle: {}", device_id);
    if mock_mode() { info!("[mock] power_cycle {}", device_id); return Ok(()); }
    let mut unifi = state.unifi.lock().await;
    unifi.power_cycle(&device_id).await.map_err(err)
}

#[tauri::command]
async fn unifi_update_firmware(device_id: String, state: State<'_, AppState>) -> CmdResult<()> {
    info!("unifi_update_firmware: {}", device_id);
    if mock_mode() { info!("[mock] update_firmware {}", device_id); return Ok(()); }
    let mut unifi = state.unifi.lock().await;
    unifi.update_firmware(&device_id).await.map_err(err)
}

// ─── Kubernetes commands ──────────────────────────────────────────────────────

fn k8s_client(state: &AppState) -> CmdResult<controllers::k8s::K8sClient> {
    let cfg = state.config.kubernetes.as_ref().ok_or("kubernetes not configured")?;
    controllers::k8s::K8sClient::new(cfg).map_err(err)
}

#[tauri::command]
async fn k8s_get_nodes(state: State<'_, AppState>) -> CmdResult<Vec<K8sNode>> {
    info!("k8s_get_nodes called");
    if mock_mode() { return Ok(mock::k8s_nodes()); }
    k8s_client(&state)?.get_nodes().await.map_err(err)
}

#[tauri::command]
async fn k8s_check_resource_health(
    config: K8sHealthCheckConfig,
    state: State<'_, AppState>,
) -> CmdResult<K8sHealthCheckResult> {
    info!("k8s_check_resource_health: {}/{}/{}", config.kind, config.namespace, config.name);
    if mock_mode() {
        return Ok(mock::resource_health().into_iter()
            .find(|r| r.kind == config.kind && r.name == config.name && r.namespace == config.namespace)
            .unwrap_or_else(|| K8sHealthCheckResult {
                kind: config.kind.clone(), name: config.name.clone(),
                namespace: config.namespace.clone(), status: "unknown".into(),
                message: None, replicas: None, response_time: None, timestamp: None, hidden: None,
            }));
    }
    k8s_client(&state)?
        .check_resource_health(&config)
        .await
        .map_err(err)
}

#[tauri::command]
async fn k8s_drain_node(node_name: String, state: State<'_, AppState>) -> CmdResult<()> {
    info!("k8s_drain_node: {}", node_name);
    if mock_mode() { info!("[mock] drain_node {}", node_name); return Ok(()); }
    k8s_client(&state)?.drain_node(&node_name).await.map_err(err)
}

#[tauri::command]
async fn k8s_uncordon_node(node_name: String, state: State<'_, AppState>) -> CmdResult<()> {
    info!("k8s_uncordon_node: {}", node_name);
    if mock_mode() { info!("[mock] uncordon_node {}", node_name); return Ok(()); }
    k8s_client(&state)?.uncordon_node(&node_name).await.map_err(err)
}

#[tauri::command]
async fn k8s_cordon_node(node_name: String, state: State<'_, AppState>) -> CmdResult<()> {
    info!("k8s_cordon_node: {}", node_name);
    if mock_mode() { info!("[mock] cordon_node {}", node_name); return Ok(()); }
    k8s_client(&state)?.cordon_node(&node_name).await.map_err(err)
}

#[tauri::command]
async fn k8s_get_node_port_mappings(state: State<'_, AppState>) -> CmdResult<Vec<NodePortMapping>> {
    info!("k8s_get_node_port_mappings called");
    if mock_mode() { return Ok(mock::node_port_mappings()); }
    let nodes = k8s_client(&state)?.get_nodes().await.map_err(err)?;
    let mappings = controllers::port_mapper::get_node_port_mappings(
        &nodes,
        &state.unifi,
        &state.port_mapping_cache,
    )
    .await;
    Ok(mappings)
}

#[tauri::command]
async fn k8s_power_cycle_node_port(
    node_name: String,
    state: State<'_, AppState>,
) -> CmdResult<()> {
    info!("k8s_power_cycle_node_port: {}", node_name);
    if mock_mode() { info!("[mock] power_cycle_node_port {}", node_name); return Ok(()); }
    let nodes = k8s_client(&state)?.get_nodes().await.map_err(err)?;
    controllers::port_mapper::power_cycle_node_port(
        &node_name,
        &nodes,
        &state.unifi,
        &state.port_mapping_cache,
    )
    .await
    .map_err(err)
}

#[tauri::command]
async fn k8s_reboot_node(node_name: String, state: State<'_, AppState>) -> CmdResult<()> {
    info!("k8s_reboot_node: {}", node_name);
    if mock_mode() { info!("[mock] reboot_node {}", node_name); return Ok(()); }
    k8s_client(&state)?.reboot_node(&node_name).await.map_err(err)
}

#[tauri::command]
async fn k8s_shutdown_node(node_name: String, state: State<'_, AppState>) -> CmdResult<()> {
    info!("k8s_shutdown_node: {}", node_name);
    if mock_mode() { info!("[mock] shutdown_node {}", node_name); return Ok(()); }
    k8s_client(&state)?.shutdown_node(&node_name).await.map_err(err)
}

#[tauri::command]
async fn k8s_run_apt_command(
    node_name: String,
    command: String,
    state: State<'_, AppState>,
) -> CmdResult<String> {
    info!("k8s_run_apt_command: {} on {}", command, node_name);
    if mock_mode() { return Ok(format!("[mock] ran '{}' on {}", command, node_name)); }
    k8s_client(&state)?
        .run_apt_command(&node_name, &command)
        .await
        .map_err(err)
}

#[tauri::command]
async fn k8s_run_ssh_command(
    node_name: String,
    command: String,
    state: State<'_, AppState>,
) -> CmdResult<String> {
    info!("k8s_run_ssh_command on {}", node_name);
    if mock_mode() { return Ok(format!("[mock] ran '{}' on {}", command, node_name)); }
    k8s_client(&state)?
        .run_ssh_command(&node_name, &command)
        .await
        .map_err(err)
}

// ─── Status commands ──────────────────────────────────────────────────────────

#[tauri::command]
async fn status_get_system_status(state: State<'_, AppState>) -> CmdResult<SystemStatus> {
    info!("status_get_system_status called");
    if mock_mode() { return Ok(mock::system_status()); }

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    // Fetch UniFi data
    let (unifi_devices, internet_stats) = {
        let mut unifi = state.unifi.lock().await;
        let devices = unifi.get_devices().await.unwrap_or_default();
        let stats = unifi.get_internet_stats().await.ok();
        (devices, stats)
    };

    // Fetch K8s data
    let (k8s_nodes, resource_health) = if let Ok(client) = k8s_client(&state) {
        let nodes = client.get_nodes().await.unwrap_or_default();
        let mut health = client.get_all_k8s_resources().await.unwrap_or_default();

        // Apply resource filters from config
        if let Some(filters) = state.config.kubernetes.as_ref().and_then(|k| k.resource_filters.as_ref()) {
            health.retain(|r| {
                !filters.iter().any(|f| {
                    f.kind == r.kind && f.name == r.name && f.namespace == r.namespace
                })
            });
        }

        (nodes, Some(health))
    } else {
        (vec![], None)
    };

    // HTTP health checks
    let health_checks = run_http_health_checks(state.config.health_checks.as_deref().unwrap_or(&[])).await;

    let ready_nodes = k8s_nodes.iter().filter(|n| n.status == "Ready").count();

    Ok(SystemStatus {
        unifi: UnifiStatus {
            connected: !unifi_devices.is_empty(),
            device_count: unifi_devices.len(),
            internet: internet_stats,
        },
        k8s: K8sStatus {
            connected: !k8s_nodes.is_empty(),
            node_count: k8s_nodes.len(),
            ready_nodes,
            resource_health,
        },
        health_checks,
        timestamp,
    })
}

async fn run_http_health_checks(configs: &[HealthCheckConfig]) -> Vec<HealthCheckResult> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let futures: Vec<_> = configs
        .iter()
        .filter(|c| !c.hidden.unwrap_or(false))
        .map(|cfg| {
            let client = client.clone();
            let cfg = cfg.clone();
            async move {
                let start = std::time::Instant::now();
                let timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;

                match client.get(&cfg.url).send().await {
                    Ok(resp) => {
                        let status_code = resp.status().as_u16();
                        let expected = cfg.expected_status.unwrap_or(200);
                        HealthCheckResult {
                            name: cfg.name.clone(),
                            url: cfg.url.clone(),
                            status: if status_code == expected { "healthy" } else { "unhealthy" }.into(),
                            status_code: Some(status_code),
                            response_time: Some(start.elapsed().as_millis() as u64),
                            error: None,
                            timestamp,
                            hidden: cfg.hidden,
                        }
                    }
                    Err(e) => HealthCheckResult {
                        name: cfg.name.clone(),
                        url: cfg.url.clone(),
                        status: "unhealthy".into(),
                        status_code: None,
                        response_time: Some(start.elapsed().as_millis() as u64),
                        error: Some(e.to_string()),
                        timestamp,
                        hidden: cfg.hidden,
                    },
                }
            }
        })
        .collect();

    futures::future::join_all(futures).await
}

// ─── App commands ─────────────────────────────────────────────────────────────

#[tauri::command]
async fn app_exit(app: tauri::AppHandle) {
    info!("User requested application exit");
    app.exit(0);
}

#[tauri::command]
async fn app_get_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

// ─── App entry point ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load config (non-fatal; we start with empty config)
    if mock_mode() {
        tracing::warn!("*** MOCK_MODE enabled — all data is synthetic ***");
    }
    let config = config::load_config().unwrap_or_else(|e| {
        tracing::warn!("Failed to load config: {} — starting with empty config", e);
        AppConfig {
            unifi: None,
            kubernetes: None,
            health_checks: None,
        }
    });

    let app_state = AppState::new(config);

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::default().build())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            // UniFi
            unifi_get_devices,
            unifi_get_internet_stats,
            unifi_power_cycle,
            unifi_update_firmware,
            // Kubernetes
            k8s_get_nodes,
            k8s_check_resource_health,
            k8s_drain_node,
            k8s_uncordon_node,
            k8s_cordon_node,
            k8s_get_node_port_mappings,
            k8s_power_cycle_node_port,
            k8s_reboot_node,
            k8s_shutdown_node,
            k8s_run_apt_command,
            k8s_run_ssh_command,
            // Status
            status_get_system_status,
            // App
            app_exit,
            app_get_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
