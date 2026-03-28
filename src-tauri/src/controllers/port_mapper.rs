use anyhow::{bail, Context, Result};
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tracing::{info, warn};

use crate::types::{K8sNode, NodePortMapping};
use crate::controllers::unifi::UnifiClient;
use crate::state::PortMappingCache;

const CACHE_TTL: Duration = Duration::from_secs(60);

pub async fn get_node_port_mappings(
    nodes: &[K8sNode],
    unifi: &Mutex<UnifiClient>,
    cache: &Mutex<Option<PortMappingCache>>,
) -> Vec<NodePortMapping> {
    // Return cached result if still fresh
    {
        let guard = cache.lock().await;
        if let Some(c) = guard.as_ref() {
            if c.timestamp.elapsed() < CACHE_TTL {
                info!("Using cached port mappings");
                return c.data.clone();
            }
        }
    }

    info!("Fetching fresh port mappings...");

    let (clients, switch_ports) = tokio::join!(
        async {
            let mut u = unifi.lock().await;
            u.get_all_clients().await.unwrap_or_else(|e| {
                warn!("Failed to fetch UniFi clients: {}", e);
                vec![]
            })
        },
        async {
            let mut u = unifi.lock().await;
            u.get_all_switch_ports().await.unwrap_or_else(|e| {
                warn!("Failed to fetch switch ports: {}", e);
                vec![]
            })
        }
    );

    let mappings: Vec<NodePortMapping> = nodes
        .iter()
        .map(|node| {
            // Try matching client by MAC, then by IP
            let client = node
                .ip
                .as_deref()
                .and_then(|ip| {
                    clients.iter().find(|c| {
                        c.get("ip").and_then(|v| v.as_str()) == Some(ip)
                    })
                })
                .or_else(|| {
                    match &node.mac {
                        Some(mac) => {
                            let mac_lower = mac.to_lowercase();
                            clients.iter().find(|c| {
                                c.get("mac")
                                    .and_then(|v| v.as_str())
                                    .map(|m| m.to_lowercase() == mac_lower)
                                    .unwrap_or(false)
                            })
                        }
                        None => None,
                    }
                });

            let Some(client) = client else {
                warn!("No UniFi client found for node {}", node.name);
                return NodePortMapping {
                    node_name: node.name.clone(),
                    switch_name: "Not Connected".into(),
                    switch_mac: None,
                    port_idx: 0,
                    poe_available: false,
                };
            };

            let sw_mac = client.get("sw_mac").and_then(|v| v.as_str()).unwrap_or("");
            let sw_port = client.get("sw_port").and_then(|v| v.as_u64()).unwrap_or(0) as u32;

            let sw_mac_lower = sw_mac.to_lowercase();
            let switch_info = switch_ports.iter().find(|(mac, _, _)| mac.to_lowercase() == sw_mac_lower);

            let Some((switch_mac, switch_name, ports)) = switch_info else {
                return NodePortMapping {
                    node_name: node.name.clone(),
                    switch_name: "Switch Not Found".into(),
                    switch_mac: None,
                    port_idx: sw_port,
                    poe_available: false,
                };
            };

            let port = ports.iter().find(|p| p.port_idx == Some(sw_port));
            let poe_available = port
                .map(|p| p.port_poe.unwrap_or(false) && p.poe_enable.unwrap_or(false))
                .unwrap_or(false);

            NodePortMapping {
                node_name: node.name.clone(),
                switch_name: switch_name.clone(),
                switch_mac: Some(switch_mac.clone()),
                port_idx: sw_port,
                poe_available,
            }
        })
        .collect();

    // Update cache
    {
        let mut guard = cache.lock().await;
        *guard = Some(PortMappingCache {
            timestamp: Instant::now(),
            data: mappings.clone(),
        });
    }

    mappings
}

pub async fn power_cycle_node_port(
    node_name: &str,
    nodes: &[K8sNode],
    unifi: &Mutex<UnifiClient>,
    cache: &Mutex<Option<PortMappingCache>>,
) -> Result<()> {
    let mappings = get_node_port_mappings(nodes, unifi, cache).await;
    let mapping = mappings
        .iter()
        .find(|m| m.node_name == node_name)
        .with_context(|| format!("Port mapping not found for node {}", node_name))?;

    if !mapping.poe_available {
        bail!("Node {} is not connected to a PoE-enabled port", node_name);
    }

    let switch_mac = mapping
        .switch_mac
        .as_deref()
        .context("Switch MAC not available")?;

    let mut unifi_guard = unifi.lock().await;
    unifi_guard.power_cycle_port(switch_mac, mapping.port_idx).await?;

    // Invalidate cache after power cycle
    {
        let mut guard = cache.lock().await;
        *guard = None;
    }

    Ok(())
}
