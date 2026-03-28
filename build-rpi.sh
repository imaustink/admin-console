#!/bin/bash
# Build Homelab Dashboard for Raspberry Pi 4/5 (aarch64)
# On macOS (Apple Silicon): uses Docker with a native ARM64 Linux container
# On Linux: uses apt cross-compilation toolchain directly

set -e

cd "$(dirname "$0")"

APPIMAGE_DIR_CROSS="src-tauri/target/aarch64-unknown-linux-gnu/release/bundle/appimage"
APPIMAGE_DIR_NATIVE="src-tauri/target/release/bundle/appimage"
APPIMAGE_DIR_DOCKER="src-tauri/target-linux/release/bundle/appimage"
IMAGE_NAME="homelab-dashboard-builder"

if [ ! -f "$HOME/.tauri/homelab-dashboard.key" ]; then
    echo "ERROR: Signing key not found at ~/.tauri/homelab-dashboard.key"
    echo "Generate it with: npx tauri signer generate -w ~/.tauri/homelab-dashboard.key"
    exit 1
fi

SIGNING_KEY=$(cat "$HOME/.tauri/homelab-dashboard.key")

if [[ "$(uname)" == "Darwin" ]]; then
    # -----------------------------------------------------------------------
    # macOS (Apple Silicon): build inside a Linux ARM64 Docker container
    # Docker Desktop on Apple Silicon runs ARM64 containers natively (no QEMU)
    # -----------------------------------------------------------------------
    if ! command -v docker &> /dev/null; then
        echo "ERROR: Docker is required to build on macOS. Install Docker Desktop."
        exit 1
    fi

    echo "Building Docker image (first time may take ~5 min)..."
    docker build --platform linux/arm64 -t "$IMAGE_NAME" -f Dockerfile.rpi .

    echo "Building Homelab Dashboard for Raspberry Pi inside Docker..."
    # Use 'tauri build' without --target inside the ARM64 container so Cargo
    # treats this as a native build (avoids cross-compilation quirks).
    # CARGO_TARGET_DIR is redirected to avoid conflicts with macOS build artifacts
    # from the mounted host volume.  Output lands at target-linux/release/bundle/.
    docker run --rm \
        --platform linux/arm64 \
        -v "$(pwd)":/build \
        -e TAURI_SIGNING_PRIVATE_KEY="$SIGNING_KEY" \
        -e TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
        -e CARGO_TARGET_DIR=/build/src-tauri/target-linux \
        "$IMAGE_NAME" \
        bash -c "cd /build && npm ci && npm run tauri:build"
else
    # -----------------------------------------------------------------------
    # Linux: native cross-compilation with apt toolchain
    # -----------------------------------------------------------------------
    . "$HOME/.cargo/env"

    echo "Adding aarch64 target (if not already present)..."
    rustup target add aarch64-unknown-linux-gnu

    echo "Installing cross-compilation toolchain (if not already present)..."
    if ! command -v aarch64-linux-gnu-gcc &> /dev/null; then
        sudo apt-get update -qq
        sudo apt-get install -y gcc-aarch64-linux-gnu
    fi

    echo "Building Homelab Dashboard for Raspberry Pi (ARM64)..."
    TAURI_SIGNING_PRIVATE_KEY="$SIGNING_KEY" \
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
    CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc \
    PKG_CONFIG_ALLOW_CROSS=1 \
        npm run tauri:build:rpi
fi

# Determine which output path was used
if [ -d "$APPIMAGE_DIR_DOCKER" ] && ls "$APPIMAGE_DIR_DOCKER"/*.AppImage &>/dev/null; then
    APPIMAGE_DIR="$APPIMAGE_DIR_DOCKER"
elif [ -d "$APPIMAGE_DIR_CROSS" ] && ls "$APPIMAGE_DIR_CROSS"/*.AppImage &>/dev/null; then
    APPIMAGE_DIR="$APPIMAGE_DIR_CROSS"
else
    APPIMAGE_DIR="$APPIMAGE_DIR_NATIVE"
fi
export APPIMAGE_DIR

echo ""
echo "Build complete! Artifacts:"
ls -lh "$APPIMAGE_DIR"/*.AppImage "$APPIMAGE_DIR"/*.AppImage.tar.gz "$APPIMAGE_DIR"/*.sig 2>/dev/null || true
