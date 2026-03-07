# Homelab Dashboard

A [Tauri 2](https://tauri.app) + [Svelte](https://svelte.dev) desktop dashboard for managing homelab infrastructure: UniFi network devices, Kubernetes clusters, and system health monitoring.

## Features

- **UniFi Controller Integration** — device status, power cycling, firmware updates
- **Kubernetes Management** — node health, drain/cordon/uncordon, resource checks, port mapping
- **System Status** — internet stats, HTTP endpoint health checks
- **Auto-Updates** — signed releases via GitHub, prompted on startup

## Tech Stack

- **Frontend**: Svelte 4 + TypeScript + Vite 5
- **Backend**: Rust (Tauri 2) — all HTTP, SSH, and business logic
- **Target Platform**: Raspberry Pi 4/5 (aarch64)

## Quick Start

### Prerequisites
- Node.js 20+ and npm
- Rust via [rustup](https://rustup.rs)

### Setup

```bash
# Install dependencies
npm install

# Copy and edit config
cp config.example.json config.json
```

See `config.example.json` for the full schema including UniFi, Kubernetes, and health check configuration.

### Running

```bash
# Development (real data — requires config.json)
npm run tauri:dev

# Development with mock data (no infrastructure needed)
npm run tauri:mock

# Production build (native)
npm run tauri:build
```

## Configuration

`config.json` (excluded from git):

```json
{
  "unifi": {
    "host": "192.168.1.1",
    "port": 8443,
    "username": "admin",
    "password": "...",
    "site": "default"
  },
  "kubernetes": {
    "cluster": "https://192.168.1.100:6443",
    "token": "...",
    "skipTLSVerify": true,
    "ssh": {
      "username": "ubuntu",
      "password": "...",
      "port": 22
    }
  },
  "healthChecks": [
    { "name": "Home Assistant", "url": "http://192.168.1.x:8123", "expectedStatus": 200 }
  ]
}
```

For Kubernetes token setup, see [K8S_TOKEN_SETUP.md](K8S_TOKEN_SETUP.md).

## Deployment to Raspberry Pi

See [DEPLOYMENT.md](DEPLOYMENT.md) for full instructions, including:
- Cross-compiling for ARM64
- Deploying via `./deploy-rpi.sh`
- Running as a systemd service
- Setting up signed auto-updates via GitHub Releases

## Releasing

```bash
./bump-version.sh patch   # or: minor, major, 2.2.0
```

Bumps the version across `package.json`, `Cargo.toml`, and `tauri.conf.json`, then commits, tags, and pushes. GitHub Actions builds and publishes the signed release automatically.

## Project Structure

```
src/                        # Svelte frontend
├── App.svelte
├── app.css
├── main.ts
└── lib/
    ├── api.ts              # Tauri invoke() wrappers
    ├── types.ts            # Shared TypeScript types
    └── components/
        ├── UnifiDevices.svelte
        ├── K8sNodes.svelte
        ├── SystemStatus.svelte
        └── modals/

src-tauri/                  # Rust backend
└── src/
    ├── lib.rs              # Tauri commands
    ├── config.rs           # Config loading
    ├── types.rs            # Rust types
    ├── state.rs            # Shared app state
    ├── mock.rs             # Mock data (MOCK_MODE=1)
    └── controllers/
        ├── unifi.rs        # UniFi HTTP client
        ├── k8s.rs          # Kubernetes REST + SSH
        └── port_mapper.rs
```

## License

MIT
