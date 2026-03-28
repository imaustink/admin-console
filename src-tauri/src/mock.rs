/// Mock data returned when MOCK_MODE=1 is set.
/// Mirrors the old TEST_MODE fixture data from the Electron app.
use crate::types::*;

pub fn unifi_devices() -> Vec<UnifiDevice> {
    vec![
        UnifiDevice {
            id: "64a1f2b3c4d5e6f7a8b9c0d1".into(),
            name: "Dream Machine Pro".into(),
            mac: "74:ac:b9:1a:2b:3c".into(),
            ip: Some("192.168.1.1".into()),
            model: Some("UDM-Pro".into()),
            device_type: Some("udm".into()),
            version: Some("3.2.7.9173".into()),
            state: 1,
            uptime: 1_209_600,
            upgradable: false,
            upgrade_to_firmware: None,
        },
        UnifiDevice {
            id: "64a1f2b3c4d5e6f7a8b9c0d2".into(),
            name: "Core Switch".into(),
            mac: "74:ac:b9:1a:2b:4d".into(),
            ip: Some("192.168.1.2".into()),
            model: Some("USW-Pro-24-POE".into()),
            device_type: Some("usw".into()),
            version: Some("6.6.55.14522".into()),
            state: 1,
            uptime: 1_209_600,
            upgradable: true,
            upgrade_to_firmware: Some("6.6.61.15278".into()),
        },
        UnifiDevice {
            id: "64a1f2b3c4d5e6f7a8b9c0d3".into(),
            name: "Living Room AP".into(),
            mac: "74:ac:b9:1a:2b:5e".into(),
            ip: Some("192.168.1.10".into()),
            model: Some("UAP-AC-Pro".into()),
            device_type: Some("uap".into()),
            version: Some("6.6.55.14522".into()),
            state: 1,
            uptime: 604_800,
            upgradable: false,
            upgrade_to_firmware: None,
        },
        UnifiDevice {
            id: "64a1f2b3c4d5e6f7a8b9c0d4".into(),
            name: "Office AP".into(),
            mac: "74:ac:b9:1a:2b:6f".into(),
            ip: Some("192.168.1.11".into()),
            model: Some("U6-LR".into()),
            device_type: Some("uap".into()),
            version: Some("6.6.55.14522".into()),
            state: 0,
            uptime: 0,
            upgradable: false,
            upgrade_to_firmware: None,
        },
    ]
}

pub fn internet_stats() -> InternetStats {
    InternetStats {
        uptime: 1_209_600,
        uptime_percentage: 99.97,
        download_bitrate: 847_300_000,
        upload_bitrate: 421_800_000,
        latency: Some(4),
        download_capacity: Some(940.2),
        upload_capacity: Some(450.7),
    }
}

pub fn network_clients() -> Vec<NetworkClient> {
    vec![
        NetworkClient {
            mac: "a4:c3:f0:11:22:33".into(),
            ip: Some("192.168.1.101".into()),
            hostname: Some("macbook-pro".into()),
            display_name: Some("Austin's MacBook Pro".into()),
            oui: Some("Apple, Inc.".into()),
            is_wired: false,
            network: Some("HomeNet".into()),
            essid: Some("HomeNet".into()),
            ap_mac: Some("74:ac:b9:1a:2b:5e".into()),
            sw_mac: None,
            sw_port: None,
            poe_enabled: false,
            signal: Some(-52),
            uptime: 86_400,
            tx_bytes: 3_200_000_000,
            rx_bytes: 12_500_000_000,
            blocked: false,
            last_seen: Some(1_700_000_000),
        },
        NetworkClient {
            mac: "dc:a6:32:bb:cc:01".into(),
            ip: Some("192.168.1.50".into()),
            hostname: Some("k8s-control".into()),
            display_name: Some("k8s-control".into()),
            oui: Some("Raspberry Pi Trading Ltd".into()),
            is_wired: true,
            network: Some("Default".into()),
            essid: None,
            ap_mac: None,
            sw_mac: Some("74:ac:b9:1a:2b:4d".into()),
            sw_port: Some(1),
            poe_enabled: true,
            signal: None,
            uptime: 1_209_600,
            tx_bytes: 500_000_000,
            rx_bytes: 200_000_000,
            blocked: false,
            last_seen: Some(1_700_000_100),
        },
        NetworkClient {
            mac: "dc:a6:32:bb:cc:02".into(),
            ip: Some("192.168.1.51".into()),
            hostname: Some("k8s-worker-1".into()),
            display_name: Some("k8s-worker-1".into()),
            oui: Some("Raspberry Pi Trading Ltd".into()),
            is_wired: true,
            network: Some("Default".into()),
            essid: None,
            ap_mac: None,
            sw_mac: Some("74:ac:b9:1a:2b:4d".into()),
            sw_port: Some(2),
            poe_enabled: true,
            signal: None,
            uptime: 1_209_600,
            tx_bytes: 450_000_000,
            rx_bytes: 180_000_000,
            blocked: false,
            last_seen: Some(1_700_000_200),
        },
        NetworkClient {
            mac: "b8:27:eb:dd:ee:10".into(),
            ip: Some("192.168.1.120".into()),
            hostname: Some("homeassistant".into()),
            display_name: Some("Home Assistant".into()),
            oui: Some("Raspberry Pi Foundation".into()),
            is_wired: true,
            network: Some("IoT".into()),
            essid: None,
            ap_mac: None,
            sw_mac: Some("74:ac:b9:1a:2b:4d".into()),
            sw_port: Some(8),
            poe_enabled: true,
            signal: None,
            uptime: 604_800,
            tx_bytes: 50_000_000,
            rx_bytes: 30_000_000,
            blocked: false,
            last_seen: Some(1_700_000_300),
        },
        NetworkClient {
            mac: "f0:18:98:ab:cd:ef".into(),
            ip: Some("192.168.1.200".into()),
            hostname: Some("android-phone".into()),
            display_name: Some("Samsung Galaxy".into()),
            oui: Some("Samsung Electronics Co".into()),
            is_wired: false,
            network: Some("HomeNet".into()),
            essid: Some("HomeNet".into()),
            ap_mac: Some("74:ac:b9:1a:2b:6f".into()),
            sw_mac: None,
            sw_port: None,
            poe_enabled: false,
            signal: Some(-68),
            uptime: 3_600,
            tx_bytes: 120_000_000,
            rx_bytes: 800_000_000,
            blocked: false,
            last_seen: Some(1_700_000_400),
        },
        NetworkClient {
            mac: "00:11:32:ff:ee:dd".into(),
            ip: Some("192.168.1.250".into()),
            hostname: Some("unknown-device".into()),
            display_name: Some("unknown-device".into()),
            oui: Some("Unknown".into()),
            is_wired: false,
            network: Some("Guest".into()),
            essid: Some("Guest".into()),
            ap_mac: Some("74:ac:b9:1a:2b:5e".into()),
            sw_mac: None,
            sw_port: None,
            poe_enabled: false,
            signal: Some(-75),
            uptime: 1_200,
            tx_bytes: 5_000_000,
            rx_bytes: 25_000_000,
            blocked: true,
            last_seen: Some(1_700_000_500),
        },
    ]
}

pub fn k8s_nodes() -> Vec<K8sNode> {
    vec![
        K8sNode {
            name: "k8s-control".into(),
            status: "Ready".into(),
            ip: Some("192.168.1.50".into()),
            mac: Some("dc:a6:32:aa:bb:01".into()),
            os: Some("Ubuntu 22.04.4 LTS".into()),
            kernel: Some("5.15.0-1048-raspi".into()),
            container_runtime: Some("containerd://1.7.2".into()),
            kubelet_version: Some("v1.28.4".into()),
            schedulable: false,
        },
        K8sNode {
            name: "k8s-worker-1".into(),
            status: "Ready".into(),
            ip: Some("192.168.1.51".into()),
            mac: Some("dc:a6:32:aa:bb:02".into()),
            os: Some("Ubuntu 22.04.4 LTS".into()),
            kernel: Some("5.15.0-1048-raspi".into()),
            container_runtime: Some("containerd://1.7.2".into()),
            kubelet_version: Some("v1.28.4".into()),
            schedulable: true,
        },
        K8sNode {
            name: "k8s-worker-2".into(),
            status: "Ready".into(),
            ip: Some("192.168.1.52".into()),
            mac: Some("dc:a6:32:aa:bb:03".into()),
            os: Some("Ubuntu 22.04.4 LTS".into()),
            kernel: Some("5.15.0-1048-raspi".into()),
            container_runtime: Some("containerd://1.7.2".into()),
            kubelet_version: Some("v1.28.4".into()),
            schedulable: true,
        },
        K8sNode {
            name: "k8s-worker-3".into(),
            status: "NotReady".into(),
            ip: Some("192.168.1.53".into()),
            mac: Some("dc:a6:32:aa:bb:04".into()),
            os: Some("Ubuntu 22.04.4 LTS".into()),
            kernel: Some("5.15.0-1048-raspi".into()),
            container_runtime: Some("containerd://1.7.2".into()),
            kubelet_version: Some("v1.28.4".into()),
            schedulable: true,
        },
    ]
}

pub fn node_port_mappings() -> Vec<NodePortMapping> {
    vec![
        NodePortMapping {
            node_name: "k8s-control".into(),
            switch_name: "Core Switch".into(),
            switch_mac: Some("74:ac:b9:1a:2b:4d".into()),
            port_idx: 1,
            poe_available: true,
        },
        NodePortMapping {
            node_name: "k8s-worker-1".into(),
            switch_name: "Core Switch".into(),
            switch_mac: Some("74:ac:b9:1a:2b:4d".into()),
            port_idx: 2,
            poe_available: true,
        },
        NodePortMapping {
            node_name: "k8s-worker-2".into(),
            switch_name: "Core Switch".into(),
            switch_mac: Some("74:ac:b9:1a:2b:4d".into()),
            port_idx: 3,
            poe_available: true,
        },
        NodePortMapping {
            node_name: "k8s-worker-3".into(),
            switch_name: "Core Switch".into(),
            switch_mac: Some("74:ac:b9:1a:2b:4d".into()),
            port_idx: 4,
            poe_available: true,
        },
    ]
}

pub fn resource_health() -> Vec<K8sHealthCheckResult> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    vec![
        K8sHealthCheckResult {
            kind: "Deployment".into(),
            name: "nginx-ingress".into(),
            namespace: "ingress-nginx".into(),
            status: "healthy".into(),
            message: None,
            replicas: Some(ReplicaStatus { desired: 2, ready: 2, available: 2 }),
            response_time: Some(42),
            timestamp: Some(ts),
            hidden: None,
        },
        K8sHealthCheckResult {
            kind: "Deployment".into(),
            name: "coredns".into(),
            namespace: "kube-system".into(),
            status: "healthy".into(),
            message: None,
            replicas: Some(ReplicaStatus { desired: 2, ready: 2, available: 2 }),
            response_time: Some(38),
            timestamp: Some(ts),
            hidden: None,
        },
        K8sHealthCheckResult {
            kind: "StatefulSet".into(),
            name: "prometheus".into(),
            namespace: "monitoring".into(),
            status: "degraded".into(),
            message: Some("1/2 replicas ready".into()),
            replicas: Some(ReplicaStatus { desired: 2, ready: 1, available: 1 }),
            response_time: Some(55),
            timestamp: Some(ts),
            hidden: None,
        },
        K8sHealthCheckResult {
            kind: "Deployment".into(),
            name: "grafana".into(),
            namespace: "monitoring".into(),
            status: "healthy".into(),
            message: None,
            replicas: Some(ReplicaStatus { desired: 1, ready: 1, available: 1 }),
            response_time: Some(29),
            timestamp: Some(ts),
            hidden: None,
        },
    ]
}

pub fn health_checks() -> Vec<HealthCheckResult> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    vec![
        HealthCheckResult {
            name: "Grafana".into(),
            url: "http://192.168.1.100:3000".into(),
            status: "healthy".into(),
            status_code: Some(200),
            response_time: Some(34),
            error: None,
            timestamp: ts,
            hidden: None,
        },
        HealthCheckResult {
            name: "Prometheus".into(),
            url: "http://192.168.1.100:9090".into(),
            status: "healthy".into(),
            status_code: Some(200),
            response_time: Some(18),
            error: None,
            timestamp: ts,
            hidden: None,
        },
        HealthCheckResult {
            name: "Home Assistant".into(),
            url: "http://192.168.1.101:8123".into(),
            status: "unhealthy".into(),
            status_code: None,
            response_time: Some(5002),
            error: Some("Connection timed out".into()),
            timestamp: ts,
            hidden: None,
        },
        HealthCheckResult {
            name: "Jellyfin".into(),
            url: "http://192.168.1.102:8096".into(),
            status: "healthy".into(),
            status_code: Some(200),
            response_time: Some(61),
            error: None,
            timestamp: ts,
            hidden: None,
        },
    ]
}

pub fn system_status() -> SystemStatus {
    let nodes = k8s_nodes();
    let ready = nodes.iter().filter(|n| n.status == "Ready").count();
    SystemStatus {
        unifi: UnifiStatus {
            connected: true,
            device_count: 4,
            internet: Some(internet_stats()),
        },
        k8s: K8sStatus {
            connected: true,
            node_count: nodes.len(),
            ready_nodes: ready,
            resource_health: Some(resource_health()),
        },
        health_checks: health_checks(),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
    }
}
