/// Kubernetes controller — talks directly to the K8s REST API via reqwest.
/// No generated client crates are needed; all we rely on is the well-known
/// JSON structure of the core/v1 and apps/v1 API groups.
use anyhow::{bail, Context, Result};
use reqwest::{Client, ClientBuilder};
use serde::Deserialize;
use std::time::Duration;
use tokio::process::Command;
use tracing::{info, warn};

use crate::types::{K8sHealthCheckConfig, K8sHealthCheckResult, K8sNode, KubernetesConfig, ReplicaStatus, SshConfig};

// ─── Raw K8s API shapes ───────────────────────────────────────────────────────

#[derive(Deserialize)]
struct NodeList {
    items: Vec<NodeItem>,
}

#[derive(Deserialize)]
struct NodeItem {
    metadata: Option<Metadata>,
    spec: Option<NodeSpec>,
    status: Option<NodeStatus>,
}

#[derive(Deserialize)]
struct Metadata {
    name: Option<String>,
    namespace: Option<String>,
}

#[derive(Deserialize)]
struct NodeSpec {
    unschedulable: Option<bool>,
}

#[derive(Deserialize)]
struct NodeStatus {
    conditions: Option<Vec<Condition>>,
    addresses: Option<Vec<Address>>,
    #[serde(rename = "nodeInfo")]
    node_info: Option<NodeInfo>,
}

#[derive(Deserialize)]
struct Condition {
    #[serde(rename = "type")]
    condition_type: Option<String>,
    status: Option<String>,
}

#[derive(Deserialize)]
struct Address {
    #[serde(rename = "type")]
    address_type: Option<String>,
    address: Option<String>,
}

#[derive(Deserialize)]
struct NodeInfo {
    #[serde(rename = "osImage")]
    os_image: Option<String>,
    #[serde(rename = "kernelVersion")]
    kernel_version: Option<String>,
    #[serde(rename = "containerRuntimeVersion")]
    container_runtime_version: Option<String>,
    #[serde(rename = "kubeletVersion")]
    kubelet_version: Option<String>,
}

// ─── Workload shapes ─────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct WorkloadList<T> {
    items: Vec<T>,
}

#[derive(Deserialize)]
struct WorkloadItem {
    metadata: Option<Metadata>,
    spec: Option<WorkloadSpec>,
    status: Option<WorkloadStatus>,
}

#[derive(Deserialize)]
struct WorkloadSpec {
    replicas: Option<i32>,
}

#[derive(Deserialize)]
struct WorkloadStatus {
    #[serde(rename = "readyReplicas")]
    ready_replicas: Option<i32>,
    #[serde(rename = "availableReplicas")]
    available_replicas: Option<i32>,
    #[serde(rename = "currentReplicas")]
    current_replicas: Option<i32>,
    #[serde(rename = "desiredNumberScheduled")]
    desired_number_scheduled: Option<i32>,
    #[serde(rename = "numberReady")]
    number_ready: Option<i32>,
    #[serde(rename = "numberAvailable")]
    number_available: Option<i32>,
}

// ─── Pod list for drain ───────────────────────────────────────────────────────

#[derive(Deserialize)]
struct PodList {
    items: Vec<PodItem>,
}

#[derive(Deserialize)]
struct PodItem {
    metadata: Option<Metadata>,
}

// ─── Client ───────────────────────────────────────────────────────────────────

pub struct K8sClient {
    http: Client,
    base_url: String,
    token: Option<String>,
    ssh: Option<SshConfig>,
}

impl K8sClient {
    pub fn new(config: &KubernetesConfig) -> Result<Self> {
        // Resolve cluster address (first in array, or single string)
        let base_url = match &config.cluster {
            Some(serde_json::Value::String(s)) => s.clone(),
            Some(serde_json::Value::Array(arr)) => arr
                .first()
                .and_then(|v| v.as_str())
                .unwrap_or("https://localhost:6443")
                .to_string(),
            _ => "https://localhost:6443".to_string(),
        };

        let skip_tls = config.skip_tls_verify.unwrap_or(false);

        let mut builder = ClientBuilder::new()
            .timeout(Duration::from_secs(30));

        if skip_tls {
            builder = builder.danger_accept_invalid_certs(true);
        } else if let Some(ca_pem) = config.ca_data.as_ref() {
            // Decode base64-encoded CA certificate
            if let Ok(pem_bytes) = base64_decode(ca_pem) {
                if let Ok(cert) = reqwest::Certificate::from_pem(&pem_bytes) {
                    builder = builder.add_root_certificate(cert);
                }
            }
        }

        let http = builder.build().context("Failed to build K8s HTTP client")?;

        Ok(Self {
            http,
            base_url,
            token: config.token.clone(),
            ssh: config.ssh.clone(),
        })
    }

    // ─── Auth helper ──────────────────────────────────────────────────────────

    fn auth_header(&self) -> Option<String> {
        self.token.as_ref().map(|t| format!("Bearer {}", t))
    }

    fn get_request(&self, path: &str) -> reqwest::RequestBuilder {
        let url = format!("{}{}", self.base_url, path);
        let req = self.http.get(url);
        if let Some(auth) = self.auth_header() {
            req.header("Authorization", auth)
        } else {
            req
        }
    }

    fn patch_request(&self, path: &str) -> reqwest::RequestBuilder {
        let url = format!("{}{}", self.base_url, path);
        let req = self.http
            .patch(url)
            .header("Content-Type", "application/strategic-merge-patch+json");
        if let Some(auth) = self.auth_header() {
            req.header("Authorization", auth)
        } else {
            req
        }
    }

    fn delete_request(&self, path: &str) -> reqwest::RequestBuilder {
        let url = format!("{}{}", self.base_url, path);
        let req = self.http.delete(url);
        if let Some(auth) = self.auth_header() {
            req.header("Authorization", auth)
        } else {
            req
        }
    }

    // ─── Node operations ──────────────────────────────────────────────────────

    pub async fn get_nodes(&self) -> Result<Vec<K8sNode>> {
        let resp = self
            .get_request("/api/v1/nodes")
            .send()
            .await
            .context("GET /api/v1/nodes failed")?;

        if !resp.status().is_success() {
            bail!("Failed to get nodes: HTTP {}", resp.status());
        }

        let list: NodeList = resp.json().await.context("Failed to parse node list")?;

        let nodes = list.items.into_iter().map(|n| {
            let name = n.metadata.as_ref().and_then(|m| m.name.clone()).unwrap_or_default();
            let spec = n.spec.as_ref();
            let status = n.status.as_ref();

            let ready = status
                .and_then(|s| s.conditions.as_ref())
                .and_then(|conds| conds.iter().find(|c| c.condition_type.as_deref() == Some("Ready")))
                .and_then(|c| c.status.as_deref())
                == Some("True");

            let ip = status
                .and_then(|s| s.addresses.as_ref())
                .and_then(|addrs| addrs.iter().find(|a| a.address_type.as_deref() == Some("InternalIP")))
                .and_then(|a| a.address.clone());

            let node_info = status.and_then(|s| s.node_info.as_ref());

            K8sNode {
                name,
                status: if ready { "Ready".into() } else { "NotReady".into() },
                ip,
                mac: None,
                os: node_info.and_then(|i| i.os_image.clone()),
                kernel: node_info.and_then(|i| i.kernel_version.clone()),
                container_runtime: node_info.and_then(|i| i.container_runtime_version.clone()),
                kubelet_version: node_info.and_then(|i| i.kubelet_version.clone()),
                schedulable: !spec.and_then(|s| s.unschedulable).unwrap_or(false),
            }
        }).collect();

        Ok(nodes)
    }

    pub async fn cordon_node(&self, name: &str) -> Result<()> {
        let resp = self
            .patch_request(&format!("/api/v1/nodes/{}", name))
            .json(&serde_json::json!({ "spec": { "unschedulable": true } }))
            .send()
            .await?;

        if !resp.status().is_success() {
            bail!("Failed to cordon node: HTTP {}", resp.status());
        }
        Ok(())
    }

    pub async fn uncordon_node(&self, name: &str) -> Result<()> {
        let resp = self
            .patch_request(&format!("/api/v1/nodes/{}", name))
            .json(&serde_json::json!({ "spec": { "unschedulable": false } }))
            .send()
            .await?;

        if !resp.status().is_success() {
            bail!("Failed to uncordon node: HTTP {}", resp.status());
        }
        Ok(())
    }

    pub async fn drain_node(&self, name: &str) -> Result<()> {
        // 1. Cordon
        self.cordon_node(name).await?;

        // 2. List all pods on the node
        let resp = self
            .get_request(&format!("/api/v1/pods?fieldSelector=spec.nodeName%3D{}", name))
            .send()
            .await?;

        if !resp.status().is_success() {
            bail!("Failed to list pods for drain: HTTP {}", resp.status());
        }

        let pods: PodList = resp.json().await.context("Failed to parse pod list")?;

        // 3. Delete each pod
        for pod in pods.items {
            let pod_name = pod.metadata.as_ref().and_then(|m| m.name.as_deref()).unwrap_or("");
            let ns = pod.metadata.as_ref().and_then(|m| m.namespace.as_deref()).unwrap_or("default");

            if pod_name.is_empty() {
                continue;
            }

            let resp = self
                .delete_request(&format!(
                    "/api/v1/namespaces/{}/{}/{}?gracePeriodSeconds=30",
                    ns, "pods", pod_name
                ))
                .send()
                .await;

            match resp {
                Ok(r) if r.status().is_success() => {
                    info!("Deleted pod {}/{}", ns, pod_name);
                }
                Ok(r) => {
                    warn!("Failed to delete pod {}/{}: HTTP {}", ns, pod_name, r.status());
                }
                Err(e) => {
                    warn!("Failed to delete pod {}/{}: {}", ns, pod_name, e);
                }
            }
        }

        Ok(())
    }

    // ─── Resource health ──────────────────────────────────────────────────────

    pub async fn get_all_k8s_resources(&self) -> Result<Vec<K8sHealthCheckResult>> {
        let (deployments, statefulsets, daemonsets) = tokio::join!(
            self.list_workloads("/apis/apps/v1/deployments", "Deployment"),
            self.list_workloads("/apis/apps/v1/statefulsets", "StatefulSet"),
            self.list_workloads("/apis/apps/v1/daemonsets", "DaemonSet"),
        );

        let mut all = Vec::new();
        all.extend(deployments.unwrap_or_default());
        all.extend(statefulsets.unwrap_or_default());
        all.extend(daemonsets.unwrap_or_default());
        Ok(all)
    }

    async fn list_workloads(&self, path: &str, kind: &str) -> Result<Vec<K8sHealthCheckResult>> {
        let resp = self.get_request(path).send().await?;
        if !resp.status().is_success() {
            bail!("Failed to list {}: HTTP {}", kind, resp.status());
        }

        let list: WorkloadList<WorkloadItem> = resp.json().await?;

        let results = list
            .items
            .into_iter()
            .map(|item| {
                let name = item.metadata.as_ref().and_then(|m| m.name.clone()).unwrap_or_default();
                let namespace = item.metadata.as_ref().and_then(|m| m.namespace.clone()).unwrap_or_else(|| "default".into());
                workload_health(kind, name, namespace, &item.spec, &item.status)
            })
            .collect();

        Ok(results)
    }

    pub async fn check_resource_health(&self, cfg: &K8sHealthCheckConfig) -> Result<K8sHealthCheckResult> {
        let start = std::time::Instant::now();
        let path = match cfg.kind.as_str() {
            "Deployment" => format!("/apis/apps/v1/namespaces/{}/deployments/{}", cfg.namespace, cfg.name),
            "StatefulSet" => format!("/apis/apps/v1/namespaces/{}/statefulsets/{}", cfg.namespace, cfg.name),
            "DaemonSet" => format!("/apis/apps/v1/namespaces/{}/daemonsets/{}", cfg.namespace, cfg.name),
            _ => bail!("Unsupported resource kind: {}", cfg.kind),
        };

        let resp = self.get_request(&path).send().await?;
        if !resp.status().is_success() {
            bail!("Failed to get {}: HTTP {}", cfg.kind, resp.status());
        }

        let item: WorkloadItem = resp.json().await?;
        let mut result = workload_health(&cfg.kind, cfg.name.clone(), cfg.namespace.clone(), &item.spec, &item.status);
        result.response_time = Some(start.elapsed().as_millis() as u64);
        Ok(result)
    }

    // ─── SSH operations ───────────────────────────────────────────────────────

    async fn run_ssh(&self, node_name: &str, command: &str) -> Result<String> {
        let nodes = self.get_nodes().await?;
        let node = nodes
            .iter()
            .find(|n| n.name == node_name)
            .with_context(|| format!("Node {} not found", node_name))?;

        let ip = node.ip.as_deref().with_context(|| format!("Node {} has no IP address", node_name))?;
        let ssh = self.ssh.as_ref().context("SSH configuration not found")?;

        let port = ssh.port.unwrap_or(22);
        let user = &ssh.username;

        let output = if let Some(key) = &ssh.private_key {
            let mut cmd = Command::new("ssh");
            cmd.args([
                "-o", "StrictHostKeyChecking=no",
                "-o", "UserKnownHostsFile=/dev/null",
                "-p", &port.to_string(),
                "-i", key,
                &format!("{}@{}", user, ip),
                command,
            ]);
            cmd.output().await?
        } else if let Some(password) = &ssh.password {
            let mut cmd = Command::new("sshpass");
            cmd.args([
                "-p", password,
                "ssh",
                "-o", "StrictHostKeyChecking=no",
                "-o", "UserKnownHostsFile=/dev/null",
                "-p", &port.to_string(),
                &format!("{}@{}", user, ip),
                command,
            ]);
            cmd.output().await?
        } else {
            bail!("No SSH authentication method configured (password or privateKey required)");
        };

        let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
        let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

        if !output.status.success() && stdout.is_empty() {
            bail!("{}", if !stderr.is_empty() { stderr } else { format!("SSH command failed with status {}", output.status) });
        }

        Ok(if !stdout.is_empty() { stdout } else { stderr })
    }

    pub async fn reboot_node(&self, node_name: &str) -> Result<()> {
        self.run_ssh(node_name, "sudo reboot").await?;
        Ok(())
    }

    pub async fn shutdown_node(&self, node_name: &str) -> Result<()> {
        self.run_ssh(node_name, "sudo shutdown -h now").await?;
        Ok(())
    }

    pub async fn run_apt_command(&self, node_name: &str, command: &str) -> Result<String> {
        let valid = ["update", "upgrade", "dist-upgrade", "autoremove", "autoclean", "clean"];
        if !valid.contains(&command) {
            bail!("Invalid apt command: {}. Must be one of: {}", command, valid.join(", "));
        }

        let apt_cmd = match command {
            "update" => "sudo apt-get update",
            "upgrade" => "sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y",
            "dist-upgrade" => "sudo DEBIAN_FRONTEND=noninteractive apt-get dist-upgrade -y",
            "autoremove" => "sudo DEBIAN_FRONTEND=noninteractive apt-get autoremove -y",
            "autoclean" => "sudo apt-get autoclean",
            "clean" => "sudo apt-get clean",
            _ => unreachable!(),
        };

        self.run_ssh(node_name, apt_cmd).await
    }

    pub async fn run_ssh_command(&self, node_name: &str, command: &str) -> Result<String> {
        self.run_ssh(node_name, command).await
    }
}

// ─── Helper: compute workload health from API response ────────────────────────

fn workload_health(
    kind: &str,
    name: String,
    namespace: String,
    spec: &Option<WorkloadSpec>,
    status: &Option<WorkloadStatus>,
) -> K8sHealthCheckResult {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    match kind {
        "Deployment" | "StatefulSet" => {
            let desired = spec.as_ref().and_then(|s| s.replicas).unwrap_or(0);
            let ready = status.as_ref().and_then(|s| s.ready_replicas).unwrap_or(0);
            let available = status.as_ref().and_then(|s| s.available_replicas.or(s.current_replicas)).unwrap_or(0);

            let (health_status, message) = if ready == 0 {
                ("unhealthy", "No replicas ready".into())
            } else if ready < desired {
                ("degraded", format!("Only {}/{} replicas ready", ready, desired))
            } else if available < desired {
                ("degraded", format!("{} ready but only {} available", ready, available))
            } else {
                ("healthy", format!("{}/{} replicas ready", ready, desired))
            };

            K8sHealthCheckResult {
                kind: kind.into(),
                name,
                namespace,
                status: health_status.into(),
                message: Some(message),
                replicas: Some(ReplicaStatus { desired, ready, available }),
                response_time: None,
                timestamp: Some(now),
                hidden: None,
            }
        }
        "DaemonSet" => {
            let desired = status.as_ref().and_then(|s| s.desired_number_scheduled).unwrap_or(0);
            let ready = status.as_ref().and_then(|s| s.number_ready).unwrap_or(0);
            let available = status.as_ref().and_then(|s| s.number_available).unwrap_or(0);

            let (health_status, message) = if ready == 0 {
                ("unhealthy", "No pods ready".into())
            } else if ready < desired {
                ("degraded", format!("Only {}/{} pods ready", ready, desired))
            } else {
                ("healthy", format!("{}/{} pods ready", ready, desired))
            };

            K8sHealthCheckResult {
                kind: kind.into(),
                name,
                namespace,
                status: health_status.into(),
                message: Some(message),
                replicas: Some(ReplicaStatus { desired, ready, available }),
                response_time: None,
                timestamp: Some(now),
                hidden: None,
            }
        }
        _ => K8sHealthCheckResult {
            kind: kind.into(),
            name,
            namespace,
            status: "unknown".into(),
            message: Some(format!("Unsupported kind: {}", kind)),
            replicas: None,
            response_time: None,
            timestamp: Some(now),
            hidden: None,
        },
    }
}

// ─── Base64 helper (no external crate needed — use std or simple impl) ────────

fn base64_decode(input: &str) -> Result<Vec<u8>> {
    // Decode base64 using a minimal approach
    let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut lookup = [255u8; 256];
    for (i, &c) in alphabet.iter().enumerate() {
        lookup[c as usize] = i as u8;
    }

    let input = input.trim().replace('\n', "").replace('\r', "");
    let input = input.trim_end_matches('=');
    let n = input.len();
    let mut out = Vec::with_capacity(n * 3 / 4);

    let bytes = input.as_bytes();
    let mut i = 0;
    while i + 3 < n {
        let a = lookup[bytes[i] as usize];
        let b = lookup[bytes[i + 1] as usize];
        let c = lookup[bytes[i + 2] as usize];
        let d = lookup[bytes[i + 3] as usize];
        if a == 255 || b == 255 { break; }
        out.push((a << 2) | (b >> 4));
        if c != 255 { out.push((b << 4) | (c >> 2)); }
        if d != 255 { out.push((c << 6) | d); }
        i += 4;
    }
    Ok(out)
}
