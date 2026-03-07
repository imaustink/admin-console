use anyhow::{bail, Context, Result};
use reqwest::{Client, ClientBuilder};
use serde::Deserialize;
use std::time::Duration;
use tracing::{info, warn};

use crate::types::{InternetStats, UnifiDevice};

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
    #[serde(rename = "rx_bytes-r")]
    rx_bytes_r: Option<u64>,
    #[serde(rename = "tx_bytes-r")]
    tx_bytes_r: Option<u64>,
    latency: Option<u32>,
    uptime_stats: Option<serde_json::Value>,
    uptime: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct RawSysinfo {
    uptime: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct RawClient {
    mac: Option<String>,
    ip: Option<String>,
    #[serde(rename = "sw_mac")]
    sw_mac: Option<String>,
    #[serde(rename = "sw_port")]
    sw_port: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
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

            let health_data: ApiResponse<RawHealth> = health_resp.json().await?;
            let sysinfo_data: ApiResponse<RawSysinfo> = if let Ok(r) = sys_resp {
                r.json().await.unwrap_or(ApiResponse { data: vec![] })
            } else {
                ApiResponse { data: vec![] }
            };

            let wan = health_data
                .data
                .into_iter()
                .find(|h| h.subsystem.as_deref() == Some("wan"))
                .context("WAN health data not found")?;

            let download_bitrate = wan.rx_bytes_r.unwrap_or(0) * 8;
            let upload_bitrate = wan.tx_bytes_r.unwrap_or(0) * 8;

            let (uptime, availability) = parse_uptime_stats(
                wan.uptime_stats.as_ref(),
                wan.uptime.as_ref(),
                &sysinfo_data.data,
            );

            return Ok(InternetStats {
                uptime,
                uptime_percentage: availability,
                download_speed: download_bitrate as f64 / 1_000_000.0,
                upload_speed: upload_bitrate as f64 / 1_000_000.0,
                download_bitrate,
                upload_bitrate,
                latency: wan.latency.unwrap_or(0),
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
