# Deployment Guide

How to build and deploy the Homelab Dashboard (Tauri AppImage) to a Raspberry Pi 4/5 running 64-bit Raspberry Pi OS.

## Prerequisites

### Development Machine (macOS Apple Silicon)
- Node.js 20+ and npm
- Docker Desktop (used to build in a native ARM64 Linux container — no QEMU)
- Signing key at `~/.tauri/homelab-dashboard.key` (generated once — see below)
- SSH config with a host named `console` pointing to the Pi

### Development Machine (Linux)
- Node.js 20+ and npm
- Rust (via `rustup`) with the `aarch64-unknown-linux-gnu` target
- `gcc-aarch64-linux-gnu` cross-linker (`sudo apt-get install gcc-aarch64-linux-gnu`)
- Signing key at `~/.tauri/homelab-dashboard.key` (generated once — see below)
- SSH config with a host named `console` pointing to the Pi

### Raspberry Pi
- 64-bit Raspberry Pi OS (Bookworm or later)
- Desktop/display environment running (Tauri requires a display)
- `sshpass` if using password-based SSH for K8s node management

---

## First-Time Setup

### 1. Generate the signing keypair (only once)
```bash
npx tauri signer generate -w ~/.tauri/homelab-dashboard.key
```
The public key is already set in `src-tauri/tauri.conf.json`. Keep the private key secret.

To use CI builds, add the private key as a GitHub Actions secret named `TAURI_SIGNING_PRIVATE_KEY`:
```bash
cat ~/.tauri/homelab-dashboard.key
# Copy the output → GitHub repo → Settings → Secrets → New repository secret
```

### 2. Add Rust ARM64 target (Linux only)
```bash
rustup target add aarch64-unknown-linux-gnu
```
(On macOS, this is handled automatically inside the Docker build container.)

### 3. Create `config.json`
Copy `config.example.json` to `config.json` and fill in your credentials.

---

## Building

### Build for Raspberry Pi
```bash
./build-rpi.sh
```

**macOS (Apple Silicon):** Builds inside a Linux ARM64 Docker container (`Dockerfile.rpi`). Docker runs ARM64 natively on Apple Silicon — no QEMU needed. First run builds the image (~5 min); subsequent runs reuse the cached image and Rust build cache.

Output AppImage: `src-tauri/target-linux/release/bundle/appimage/`

**Linux:** Uses `gcc-aarch64-linux-gnu` cross-compiler directly.

Output AppImage: `src-tauri/target/aarch64-unknown-linux-gnu/release/bundle/appimage/`

### Local development (native)
```bash
npm run tauri:dev       # real data (requires config.json)
npm run tauri:mock      # mock data (no Pi needed)
```

---

## Deploying

```bash
./deploy-rpi.sh
```

This will:
1. Find the AppImage produced by `build-rpi.sh`
2. Upload the AppImage to `/opt/homelab-dashboard/` on the Pi
3. Extract the AppImage (avoids FUSE mount requirement under systemd)
4. Upload `config.json` (only if one doesn't already exist on the Pi)
5. Install `homelab-dashboard.service` as a systemd service
6. Enable and start the service

### SSH config requirement
`~/.ssh/config` must have a `console` entry:
```
Host console
    HostName 192.168.1.x
    User pi
    IdentityFile ~/.ssh/id_rsa
```

---

## Configuration on the Pi

Config file location: `/etc/homelab-dashboard/config.json`

To edit it directly on the Pi:
```bash
ssh console 'sudo nano /etc/homelab-dashboard/config.json'
ssh console 'sudo systemctl restart homelab-dashboard'
```

See `config.example.json` for the full schema.

---

## Service Management

```bash
# Logs (live)
ssh console 'sudo journalctl -u homelab-dashboard -f'

# Status
ssh console 'sudo systemctl status homelab-dashboard'

# Restart
ssh console 'sudo systemctl restart homelab-dashboard'

# Stop
ssh console 'sudo systemctl stop homelab-dashboard'
```

---

## Releasing a New Version

```bash
./bump-version.sh patch    # or: minor, major, or explicit version like 2.2.0
```

This bumps the version in `package.json`, `Cargo.toml`, and `tauri.conf.json`, commits, tags, and pushes. The GitHub Actions workflow then cross-compiles and publishes a signed release automatically.

Running instances will detect the new version on next startup and prompt the user to update.
