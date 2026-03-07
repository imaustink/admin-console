#!/bin/bash
# Build Homelab Dashboard for Raspberry Pi 4/5 (aarch64) via Tauri cross-compilation

set -e

cd "$(dirname "$0")"
. "$HOME/.cargo/env"

echo "Adding aarch64 target (if not already present)..."
rustup target add aarch64-unknown-linux-gnu

echo "Installing cross-compilation toolchain (if not already present)..."
if ! command -v aarch64-linux-gnu-gcc &> /dev/null; then
    sudo apt-get update -qq
    sudo apt-get install -y gcc-aarch64-linux-gnu
fi

if [ ! -f "$HOME/.tauri/homelab-dashboard.key" ]; then
    echo "ERROR: Signing key not found at ~/.tauri/homelab-dashboard.key"
    echo "Generate it with: npx tauri signer generate -w ~/.tauri/homelab-dashboard.key"
    exit 1
fi

echo "Building Homelab Dashboard for Raspberry Pi (ARM64)..."
TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/homelab-dashboard.key" \
CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc \
PKG_CONFIG_ALLOW_CROSS=1 \
  npm run tauri:build:rpi

APPIMAGE_DIR="src-tauri/target/aarch64-unknown-linux-gnu/release/bundle/appimage"
echo ""
echo "Build complete! Artifacts:"
ls -lh "$APPIMAGE_DIR"/*.AppImage "$APPIMAGE_DIR"/*.AppImage.tar.gz "$APPIMAGE_DIR"/*.sig 2>/dev/null || true
