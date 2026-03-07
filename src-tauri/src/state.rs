use std::sync::Arc;
use tokio::sync::Mutex;
use crate::types::{AppConfig, NodePortMapping};
use crate::controllers::unifi::UnifiClient;

pub struct PortMappingCache {
    pub timestamp: std::time::Instant,
    pub data: Vec<NodePortMapping>,
}

pub struct AppState {
    pub config: AppConfig,
    /// Singleton UniFi client — keeps the session cookie alive
    pub unifi: Arc<Mutex<UnifiClient>>,
    /// In-memory port mapping cache (TTL: 60 s)
    pub port_mapping_cache: Arc<Mutex<Option<PortMappingCache>>>,
}

impl AppState {
    pub fn new(config: AppConfig) -> Self {
        let unifi_cfg = config.unifi.clone().unwrap_or_else(|| crate::types::UnifiConfig {
            host: String::new(),
            port: 8443,
            username: String::new(),
            password: String::new(),
            site: None,
        });

        let unifi = UnifiClient::new(
            unifi_cfg.host.clone(),
            unifi_cfg.port,
            unifi_cfg.username.clone(),
            unifi_cfg.password.clone(),
            unifi_cfg.site.clone().unwrap_or_else(|| "default".into()),
        );

        Self {
            config,
            unifi: Arc::new(Mutex::new(unifi)),
            port_mapping_cache: Arc::new(Mutex::new(None)),
        }
    }
}
