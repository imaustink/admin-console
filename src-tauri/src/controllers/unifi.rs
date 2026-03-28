use anyhow::{bail, Context, Result};
use reqwest::{Client, ClientBuilder};
use serde::Deserialize;
use std::time::Duration;
use tracing::{info, warn};

use crate::types::{InternetStats, NetworkClient, UnifiDevice};

// ─── Internal API response shapes ────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ApiResponse<T> {
    data: Vec<T>,
}

#[derive(Debug, Deserialize)]
struct RawDevice {
    #[serde(rename = "_id")]
    id: String,
    name: Option<String>,
    hostname: Option<String>,
    ip: Option<String>,
    mac: String,
    model: Option<String>,
    #[serde(rename = "type")]
    device_type: Option<String>,
    version: Option<String>,
    state: Option<i32>,
    uptime: Option<u64>,
    upgradable: Option<bool>,
    upgrade_to_firmware: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawHealth {
    subsystem: Option<String>,
    // UniFi returns these as floats in some firmware versions; use f64 to avoid silent None
    #[serde(rename = "rx_bytes-r")]
    rx_bytes_r: Option<f64>,
    #[serde(rename = "tx_bytes-r")]
    tx_bytes_r: Option<f64>,
    uptime_stats: Option<serde_json::Value>,
    uptime: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct RawProviderCapabilities {
    download_kilobits_per_second: Option<f64>,
    upload_kilobits_per_second: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct RawNetworkConf {
    purpose: Option<String>,
    wan_networkgroup: Option<String>,
    wan_provider_capabilities: Option<RawProviderCapabilities>,
}

#[derive(Debug, Deserialize)]
struct RawSysinfo {
    uptime: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct RawClient {
    mac: Option<String>,
    ip: Option<String>,
    #[serde(rename = "sw_mac")]
    sw_mac: Option<String>,
    #[serde(rename = "sw_port")]
    sw_port: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct RawPort {
    pub port_idx: Option<u32>,
    pub port_poe: Option<bool>,
    pub poe_enable: Option<bool>,
    pub mac: Option<String>,
    pub up: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct RawDeviceFull {
    mac: String,
    name: Option<String>,
    hostname: Option<String>,
    #[serde(rename = "type")]
    device_type: Option<String>,
    port_table: Option<Vec<RawPort>>,
}

// ─── Public client ────────────────────────────────────────────────────────────

pub struct UnifiClient {
    http: Client,
    base_url: String,
    site: String,
    username: String,
    password: String,
    pub cookie: Option<String>,
    is_unifi_os: bool,
}

impl UnifiClient {
    pub fn new(host: String, port: u16, username: String, password: String, site: String) -> Self {
        let http = ClientBuilder::new()
            .danger_accept_invalid_certs(true)
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to build HTTP client");

        let is_unifi_os = port == 443;
        let base_url = format!("https://{}:{}", host, port);

        Self {
            http,
            base_url,
            site,
            username,
            password,
            cookie: None,
            is_unifi_os,
        }
    }

    // ─── Cookie helpers ───────────────────────────────────────────────────────

    fn set_cookie_header(&self) -> String {
        self.cookie.clone().unwrap_or_default()
    }

    fn extract_cookie(headers: &reqwest::header::HeaderMap) -> String {
        headers
            .get_all(reqwest::header::SET_COOKIE)
            .iter()
            .filter_map(|v| v.to_str().ok())
            .collect::<Vec<_>>()
            .join("; ")
    }

    // ─── API path helpers ─────────────────────────────────────────────────────

    fn api_path(&self, path: &str) -> String {
        if self.is_unifi_os && path.starts_with("/api/s/") {
            format!("{}/proxy/network{}", self.base_url, path)
        } else {
            format!("{}{}", self.base_url, path)
        }
    }

    // ─── Auth ─────────────────────────────────────────────────────────────────

    pub async fn login(&mut self) -> Result<()> {
        info!("Logging in to UniFi controller...");
        let endpoint = if self.is_unifi_os { "/api/auth/login" } else { "/api/login" };
        let url = format!("{}{}", self.base_url, endpoint);

        let body = serde_json::json!({
            "username": self.username,
            "password": self.password,
        });

        let resp = self
            .http
            .post(&url)
            .json(&body)
            .send()
            .await
            .with_context(|| format!("Login POST to {url} failed"))?;

        if !resp.status().is_success() {
            bail!("UniFi login failed: HTTP {}", resp.status());
        }

        let cookie = Self::extract_cookie(resp.headers());
        if cookie.is_empty() {
            bail!("UniFi login returned no Set-Cookie header");
        }

        self.cookie = Some(cookie);
        info!("UniFi login successful");
        Ok(())
    }

    async fn ensure_logged_in(&mut self) -> Result<()> {
        if self.cookie.is_none() {
            self.login().await?;
        }
        Ok(())
    }

    // ─── Public API methods ───────────────────────────────────────────────────

    pub async fn get_devices(&mut self) -> Result<Vec<UnifiDevice>> {
        for attempt in 0u8..2 {
            self.ensure_logged_in().await?;
            let url = self.api_path(&format!("/api/s/{}/stat/device", self.site));
            let resp = self
                .http
                .get(&url)
                .header("Cookie", self.set_cookie_header())
                .send()
                .await?;

            let status = resp.status().as_u16();
            if (status == 401 || status == 403) && attempt == 0 {
                warn!("Got {} from UniFi on get_devices, re-authenticating...", status);
                self.cookie = None;
                continue;
            }
            if !resp.status().is_success() {
                bail!("UniFi get_devices failed: HTTP {}", resp.status());
            }

            let payload: ApiResponse<RawDevice> = resp
                .json()
                .await
                .context("Failed to parse device list response")?;

            return Ok(payload
                .data
                .into_iter()
                .map(|d| UnifiDevice {
                    id: d.id,
                    name: d.name.or(d.hostname).unwrap_or_else(|| "Unknown".into()),
                    mac: d.mac,
                    ip: d.ip,
                    model: d.model,
                    device_type: d.device_type,
                    version: d.version,
                    state: d.state.unwrap_or(0),
                    uptime: d.uptime.unwrap_or(0),
                    upgradable: d.upgradable.unwrap_or(false),
                    upgrade_to_firmware: d.upgrade_to_firmware,
                })
                .collect());
        }
        bail!("get_devices failed after retry")
    }

    pub async fn get_internet_stats(&mut self) -> Result<InternetStats> {
        for attempt in 0u8..2 {
            self.ensure_logged_in().await?;
            let health_url = self.api_path(&format!("/api/s/{}/stat/health", self.site));
            let sysinfo_url = self.api_path(&format!("/api/s/{}/stat/sysinfo", self.site));
            let netconf_url = self.api_path(&format!("/api/s/{}/rest/networkconf", self.site));
            let cookie = self.set_cookie_header();

            let health_resp = self.http.get(&health_url).header("Cookie", &cookie).send().await?;
            let status = health_resp.status().as_u16();
            if (status == 401 || status == 403) && attempt == 0 {
                self.cookie = None;
                continue;
            }
            if !health_resp.status().is_success() {
                bail!("UniFi health endpoint failed: HTTP {}", health_resp.status());
            }

            let sys_resp = self.http.get(&sysinfo_url).header("Cookie", &cookie).send().await;
            let netconf_resp = self.http.get(&netconf_url).header("Cookie", &cookie).send().await;

            let health_data: ApiResponse<RawHealth> = health_resp.json().await?;
            let sysinfo_data: ApiResponse<RawSysinfo> = if let Ok(r) = sys_resp {
                r.json().await.unwrap_or(ApiResponse { data: vec![] })
            } else {
                ApiResponse { data: vec![] }
            };
            let wan1_conf: Option<RawProviderCapabilities> = if let Ok(r) = netconf_resp {
                r.json::<ApiResponse<RawNetworkConf>>().await.ok()
                    .and_then(|d| d.data.into_iter()
                        .find(|n| n.purpose.as_deref() == Some("wan")
                            && n.wan_networkgroup.as_deref() == Some("WAN"))
                        .and_then(|n| n.wan_provider_capabilities)
                    )
            } else {
                None
            };

            let wan = health_data
                .data
                .into_iter()
                .find(|h| h.subsystem.as_deref() == Some("wan"))
                .context("WAN health data not found")?;

            let latency = wan.uptime_stats.as_ref()
                .and_then(|s| s.get("WAN"))
                .and_then(|w| w.get("latency_average"))
                .and_then(|v| v.as_f64())
                .map(|v| v.round() as u32);
            let download_bitrate = (wan.rx_bytes_r.unwrap_or(0.0) * 8.0) as u64;
            let upload_bitrate   = (wan.tx_bytes_r.unwrap_or(0.0) * 8.0) as u64;
            info!("WAN rx_bytes-r={:?} tx_bytes-r={:?} → down={} up={} bits/s",
                wan.rx_bytes_r, wan.tx_bytes_r, download_bitrate, upload_bitrate);

            let (uptime, availability) = parse_uptime_stats(
                wan.uptime_stats.as_ref(),
                wan.uptime.as_ref(),
                &sysinfo_data.data,
            );

            let download_capacity = wan1_conf.as_ref()
                .and_then(|c| c.download_kilobits_per_second)
                .map(|kbps| kbps / 1000.0);
            let upload_capacity = wan1_conf.as_ref()
                .and_then(|c| c.upload_kilobits_per_second)
                .map(|kbps| kbps / 1000.0);

            return Ok(InternetStats {
                uptime,
                uptime_percentage: availability,
                download_bitrate,
                upload_bitrate,
                latency,
                download_capacity,
                upload_capacity,
            });
        }
        bail!("get_internet_stats failed after retry")
    }

    pub async fn power_cycle(&mut self, device_id: &str) -> Result<()> {
        for attempt in 0u8..2 {
            self.ensure_logged_in().await?;
            let url = self.api_path(&format!("/api/s/{}/cmd/devmgr", self.site));
            let resp = self
                .http
                .post(&url)
                .header("Cookie", self.set_cookie_header())
                .json(&serde_json::json!({ "cmd": "power-cycle", "mac": device_id }))
                .send()
                .await?;

            let status = resp.status().as_u16();
            if (status == 401 || status == 403) && attempt == 0 {
                self.cookie = None;
                continue;
            }
            if !resp.status().is_success() {
                bail!("Power cycle failed: HTTP {}", resp.status());
            }
            return Ok(());
        }
        bail!("power_cycle failed after retry")
    }

    pub async fn update_firmware(&mut self, device_id: &str) -> Result<()> {
        for attempt in 0u8..2 {
            self.ensure_logged_in().await?;
            let url = self.api_path(&format!("/api/s/{}/cmd/devmgr", self.site));
            let resp = self
                .http
                .post(&url)
                .header("Cookie", self.set_cookie_header())
                .json(&serde_json::json!({ "cmd": "upgrade", "mac": device_id }))
                .send()
                .await?;

            let status = resp.status().as_u16();
            if (status == 401 || status == 403) && attempt == 0 {
                self.cookie = None;
                continue;
            }
            if !resp.status().is_success() {
                bail!("Firmware update failed: HTTP {}", resp.status());
            }
            return Ok(());
        }
        bail!("update_firmware failed after retry")
    }

    pub async fn get_network_clients(&mut self) -> Result<Vec<NetworkClient>> {
        // Fetch switch port PoE info best-effort to annotate which clients are PoE-powered.
        // Build (sw_mac_lower, port_idx) → poe_enabled lookup.
        use std::collections::HashMap;
        let mut poe_map: HashMap<(String, u32), bool> = HashMap::new();
        if let Ok(switch_ports) = self.get_all_switch_ports().await {
            for (sw_mac, _, ports) in &switch_ports {
                let sw_mac_lower = sw_mac.to_lowercase();
                for port in ports {
                    if let Some(idx) = port.port_idx {
                        let enabled = port.port_poe.unwrap_or(false) && port.poe_enable.unwrap_or(false);
                        poe_map.insert((sw_mac_lower.clone(), idx), enabled);
                    }
                }
            }
        }

        for attempt in 0u8..2 {
            self.ensure_logged_in().await?;
            let cookie = self.set_cookie_header();

            // Fetch active clients (/stat/sta) and known-client aliases (/rest/user) in parallel
            let sta_url  = self.api_path(&format!("/api/s/{}/stat/sta",  self.site));
            let user_url = self.api_path(&format!("/api/s/{}/rest/user", self.site));

            let sta_resp = self.http.get(&sta_url).header("Cookie", &cookie).send().await?;

            let status = sta_resp.status().as_u16();
            if (status == 401 || status == 403) && attempt == 0 {
                self.cookie = None;
                continue;
            }
            if !sta_resp.status().is_success() {
                bail!("get_network_clients failed: HTTP {}", sta_resp.status());
            }

            // /rest/user is best-effort — don't fail if it errors
            let user_resp = self.http.get(&user_url).header("Cookie", &cookie).send().await.ok();

            // Build MAC → (alias_name, alias_hostname, alias_oui) lookup from /rest/user
            let mut alias_map: HashMap<String, (Option<String>, Option<String>, Option<String>)> =
                HashMap::new();
            if let Some(r) = user_resp {
                if let Ok(payload) = r.json::<ApiResponse<serde_json::Value>>().await {
                    for rec in payload.data {
                        let mac = match rec.get("mac").and_then(|x| x.as_str()) {
                            Some(m) => m.to_lowercase(),
                            None => continue,
                        };
                        let name = rec.get("name").and_then(|x| x.as_str())
                            .filter(|s| !s.is_empty())
                            .map(String::from);
                        let hostname = rec.get("hostname").and_then(|x| x.as_str())
                            .filter(|s| !s.is_empty())
                            .map(String::from);
                        let oui = rec.get("oui").and_then(|x| x.as_str())
                            .filter(|s| !s.is_empty())
                            .map(String::from);
                        alias_map.insert(mac, (name, hostname, oui));
                    }
                }
            }

            let payload: ApiResponse<serde_json::Value> = sta_resp.json().await?;
            let clients = payload.data.into_iter().map(|v| {
                let mac = v.get("mac").and_then(|x| x.as_str()).unwrap_or("").to_lowercase();
                let ip = v.get("ip").and_then(|x| x.as_str()).map(String::from);

                // Names: prefer /stat/sta values, fall back to /rest/user aliases
                let sta_name = v.get("name").and_then(|x| x.as_str())
                    .filter(|s| !s.is_empty())
                    .map(String::from);
                let sta_hostname = v.get("hostname").and_then(|x| x.as_str())
                    .filter(|s| !s.is_empty())
                    .map(String::from);
                let sta_oui = v.get("oui").and_then(|x| x.as_str())
                    .filter(|s| !s.is_empty())
                    .map(String::from);

                let alias = alias_map.get(&mac);
                let alias_name     = alias.and_then(|(n, _, _)| n.clone());
                let alias_hostname = alias.and_then(|(_, h, _)| h.clone());
                let alias_oui      = alias.and_then(|(_, _, o)| o.clone());

                // Best name: sta alias > sta hostname > rest/user alias > rest/user hostname > IP > MAC
                let display_name = sta_name
                    .or(alias_name)
                    .or_else(|| sta_hostname.clone())
                    .or_else(|| alias_hostname.clone())
                    .or_else(|| ip.clone())
                    .or_else(|| Some(mac.clone()));

                // Best hostname: prefer sta, fall back to rest/user
                let hostname = sta_hostname.or(alias_hostname);

                // Best OUI: prefer sta, fall back to rest/user
                let oui = sta_oui.or(alias_oui);

                let is_wired = v.get("is_wired").and_then(|x| x.as_bool()).unwrap_or(false);
                let network  = v.get("network").and_then(|x| x.as_str()).map(String::from);
                let essid    = v.get("essid").and_then(|x| x.as_str()).map(String::from);
                let ap_mac   = v.get("ap_mac").and_then(|x| x.as_str()).map(String::from);
                let sw_mac     = v.get("sw_mac").and_then(|x| x.as_str()).map(String::from);
                let sw_port    = v.get("sw_port").and_then(|x| x.as_u64()).map(|x| x as u32);
                let poe_enabled = sw_mac.as_deref()
                    .zip(sw_port)
                    .map(|(m, p)| *poe_map.get(&(m.to_lowercase(), p)).unwrap_or(&false))
                    .unwrap_or(false);
                let signal     = v.get("signal").and_then(|x| x.as_i64()).map(|x| x as i32);
                let uptime   = v.get("uptime").and_then(|x| x.as_u64()).unwrap_or(0);
                let tx_bytes = v.get("tx_bytes").and_then(|x| x.as_u64()).unwrap_or(0);
                let rx_bytes = v.get("rx_bytes").and_then(|x| x.as_u64()).unwrap_or(0);
                let blocked  = v.get("blocked").and_then(|x| x.as_bool()).unwrap_or(false);
                let last_seen = v.get("last_seen").and_then(|x| x.as_u64());

                NetworkClient {
                    mac, ip, hostname, display_name, oui, is_wired, network,
                    essid, ap_mac, sw_mac, sw_port, poe_enabled, signal, uptime, tx_bytes,
                    rx_bytes, blocked, last_seen,
                }
            }).collect();
            return Ok(clients);
        }
        bail!("get_network_clients failed after retry")
    }

    pub async fn get_all_clients(&mut self) -> Result<Vec<serde_json::Value>> {
        for attempt in 0u8..2 {
            self.ensure_logged_in().await?;
            let url = self.api_path(&format!("/api/s/{}/stat/sta", self.site));
            let resp = self
                .http
                .get(&url)
                .header("Cookie", self.set_cookie_header())
                .send()
                .await?;

            let status = resp.status().as_u16();
            if (status == 401 || status == 403) && attempt == 0 {
                self.cookie = None;
                continue;
            }
            if !resp.status().is_success() {
                bail!("get_all_clients failed: HTTP {}", resp.status());
            }
            let payload: ApiResponse<serde_json::Value> = resp.json().await?;
            return Ok(payload.data);
        }
        bail!("get_all_clients failed after retry")
    }

    #[allow(dead_code)]
    pub async fn get_switch_ports(&mut self, switch_mac: &str) -> Result<Vec<RawPort>> {
        for attempt in 0u8..2 {
            self.ensure_logged_in().await?;
            let url =
                self.api_path(&format!("/api/s/{}/stat/device/{}", self.site, switch_mac));
            let resp = self
                .http
                .get(&url)
                .header("Cookie", self.set_cookie_header())
                .send()
                .await?;

            let status = resp.status().as_u16();
            if (status == 401 || status == 403) && attempt == 0 {
                self.cookie = None;
                continue;
            }
            if !resp.status().is_success() {
                bail!("get_switch_ports failed: HTTP {}", resp.status());
            }
            let payload: ApiResponse<RawDeviceFull> = resp.json().await?;
            let device = payload.data.into_iter().next().context("Switch not found")?;
            return Ok(device.port_table.unwrap_or_default());
        }
        bail!("get_switch_ports failed after retry")
    }

    /// Returns (switch_mac, switch_name, port_table) tuples for all USW/USG devices.
    pub async fn get_all_switch_ports(&mut self) -> Result<Vec<(String, String, Vec<RawPort>)>> {
        for attempt in 0u8..2 {
            self.ensure_logged_in().await?;
            let url = self.api_path(&format!("/api/s/{}/stat/device", self.site));
            let resp = self
                .http
                .get(&url)
                .header("Cookie", self.set_cookie_header())
                .send()
                .await?;

            let status = resp.status().as_u16();
            if (status == 401 || status == 403) && attempt == 0 {
                self.cookie = None;
                continue;
            }
            if !resp.status().is_success() {
                bail!("get_all_switch_ports failed: HTTP {}", resp.status());
            }
            let payload: ApiResponse<RawDeviceFull> = resp.json().await?;
            let switches = payload.data.into_iter().filter(|d| {
                matches!(d.device_type.as_deref(), Some("usw") | Some("usg"))
            });
            return Ok(switches
                .map(|s| {
                    let name = s.name.or(s.hostname).unwrap_or_else(|| s.mac.clone());
                    (s.mac, name, s.port_table.unwrap_or_default())
                })
                .collect());
        }
        bail!("get_all_switch_ports failed after retry")
    }

    pub async fn power_cycle_port(&mut self, switch_mac: &str, port_idx: u32) -> Result<()> {
        self.ensure_logged_in().await?;
        let url = self.api_path(&format!("/api/s/{}/rest/device/{}", self.site, switch_mac));

        // Disable PoE (with re-auth retry)
        for attempt in 0u8..2 {
            let resp = self
                .http
                .put(&url)
                .header("Cookie", self.set_cookie_header())
                .json(&serde_json::json!({
                    "port_overrides": [{ "port_idx": port_idx, "poe_mode": "off" }]
                }))
                .send()
                .await?;

            let status = resp.status().as_u16();
            if (status == 401 || status == 403) && attempt == 0 {
                self.cookie = None;
                self.login().await?;
                continue;
            }
            if !resp.status().is_success() {
                bail!("PoE disable failed: HTTP {}", resp.status());
            }
            break;
        }

        tokio::time::sleep(Duration::from_secs(5)).await;

        // Re-enable PoE
        let resp = self
            .http
            .put(&url)
            .header("Cookie", self.set_cookie_header())
            .json(&serde_json::json!({
                "port_overrides": [{ "port_idx": port_idx, "poe_mode": "auto" }]
            }))
            .send()
            .await?;

        if !resp.status().is_success() {
            bail!("PoE re-enable failed: HTTP {}", resp.status());
        }

        Ok(())
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn parse_uptime_stats(
    uptime_stats: Option<&serde_json::Value>,
    uptime: Option<&serde_json::Value>,
    sysinfo: &[RawSysinfo],
) -> (u64, f64) {
    if let Some(stats) = uptime_stats {
        if let Some(wan_obj) = stats.get("WAN") {
            let up = wan_obj.get("uptime").and_then(|v| v.as_u64()).unwrap_or(0);
            let avail = wan_obj
                .get("availability")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            return (up, avail);
        }
        if let Some(u) = stats.get("uptime").and_then(|v| v.as_u64()) {
            return (u, 0.0);
        }
        if let Some(u) = stats.as_u64() {
            return (u, 0.0);
        }
    }

    if let Some(u) = uptime.and_then(|v| v.as_u64()) {
        return (u, 0.0);
    }

    let sys_uptime = sysinfo.first().and_then(|s| s.uptime).unwrap_or(0);
    (sys_uptime, 0.0)
}
