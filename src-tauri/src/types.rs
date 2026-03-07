use serde::{Deserialize, Serialize};

// ─── UniFi Types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiDevice {
    #[serde(rename = "_id")]
    pub id: String,
    pub name: String,
    pub mac: String,
    pub ip: Option<String>,
    pub model: Option<String>,
    #[serde(rename = "type")]
    pub device_type: Option<String>,
    pub version: Option<String>,
    pub state: i32,
    pub uptime: u64,
    pub upgradable: bool,
    pub upgrade_to_firmware: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InternetStats {
    pub uptime: u64,
    pub uptime_percentage: f64,
    pub download_speed: f64,
    pub upload_speed: f64,
    pub download_bitrate: u64,
    pub upload_bitrate: u64,
    pub latency: u32,
}

// ─── Kubernetes Types ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct K8sNode {
    pub name: String,
    pub status: String,
    pub ip: Option<String>,
    pub mac: Option<String>,
    pub os: Option<String>,
    pub kernel: Option<String>,
    pub container_runtime: Option<String>,
    pub kubelet_version: Option<String>,
    pub schedulable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct K8sHealthCheckConfig {
    pub name: String,
    pub namespace: String,
    pub kind: String,
    pub interval: Option<u64>,
    pub hidden: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplicaStatus {
    pub desired: i32,
    pub ready: i32,
    pub available: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct K8sHealthCheckResult {
    pub kind: String,
    pub name: String,
    pub namespace: String,
    pub status: String, // "healthy" | "unhealthy" | "degraded" | "unknown"
    pub message: Option<String>,
    pub replicas: Option<ReplicaStatus>,
    pub response_time: Option<u64>,
    pub timestamp: Option<u64>,
    pub hidden: Option<bool>,
}

// ─── Port Mapping Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodePortMapping {
    pub node_name: String,
    pub switch_name: String,
    pub switch_mac: Option<String>,
    pub port_idx: u32,
    pub poe_available: bool,
}

// ─── Status Types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheckResult {
    pub name: String,
    pub url: String,
    pub status: String, // "healthy" | "unhealthy" | "unknown"
    pub status_code: Option<u16>,
    pub response_time: Option<u64>,
    pub error: Option<String>,
    pub timestamp: u64,
    pub hidden: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiStatus {
    pub connected: bool,
    pub device_count: usize,
    pub internet: Option<InternetStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct K8sStatus {
    pub connected: bool,
    pub node_count: usize,
    pub ready_nodes: usize,
    pub resource_health: Option<Vec<K8sHealthCheckResult>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    pub unifi: UnifiStatus,
    pub k8s: K8sStatus,
    pub health_checks: Vec<HealthCheckResult>,
    pub timestamp: u64,
}

// ─── Config Types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct UnifiConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub site: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SshConfig {
    pub username: String,
    pub password: Option<String>,
    #[serde(rename = "privateKey")]
    pub private_key: Option<String>,
    pub port: Option<u16>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct K8sResourceFilter {
    pub kind: String,
    pub name: String,
    pub namespace: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct KubernetesConfig {
    pub cluster: Option<serde_json::Value>, // String or Vec<String>
    pub token: Option<String>,
    #[serde(rename = "caData")]
    pub ca_data: Option<String>,
    #[serde(rename = "skipTLSVerify")]
    pub skip_tls_verify: Option<bool>,
    pub ssh: Option<SshConfig>,
    #[serde(rename = "resourceFilters")]
    pub resource_filters: Option<Vec<K8sResourceFilter>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HealthCheckConfig {
    pub name: String,
    pub url: String,
    pub method: Option<String>,
    #[serde(rename = "expectedStatus")]
    pub expected_status: Option<u16>,
    pub timeout: Option<u64>,
    pub interval: Option<u64>,
    pub hidden: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub unifi: Option<UnifiConfig>,
    pub kubernetes: Option<KubernetesConfig>,
    #[serde(rename = "healthChecks")]
    pub health_checks: Option<Vec<HealthCheckConfig>>,
}
