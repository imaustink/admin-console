#!/bin/bash
# Deploy Homelab Dashboard (Tauri AppImage) to Raspberry Pi
# Uses SSH host alias "console" (configured in ~/.ssh/config)

set -e

cd "$(dirname "$0")"

SSH_HOST="console"
REMOTE_USER="admin"
REMOTE_APP_DIR="/opt/homelab-dashboard"
REMOTE_CONFIG_DIR="/etc/homelab-dashboard"
SERVICE_NAME="homelab-dashboard"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

echo "Deploying Homelab Dashboard to Raspberry Pi..."

# Find the AppImage produced by build-rpi.sh
APPIMAGE=$(find src-tauri/target/aarch64-unknown-linux-gnu/release/bundle/appimage -name "*.AppImage" ! -name "*.tar.gz" 2>/dev/null | head -1)
if [ -z "$APPIMAGE" ]; then
    echo -e "${RED}ERROR: AppImage not found. Run ./build-rpi.sh first.${NC}"
    exit 1
fi
echo -e "${BLUE}Found: $APPIMAGE${NC}"

# Test SSH connection
echo -e "${BLUE}Testing SSH connection to $SSH_HOST...${NC}"
if ! ssh -o ConnectTimeout=5 "$SSH_HOST" "echo 'Connection successful'" > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Cannot connect to $SSH_HOST${NC}"
    echo -e "${YELLOW}Make sure your SSH config has a host named 'console'${NC}"
    exit 1
fi

# Stop service
echo -e "${BLUE}Stopping existing service...${NC}"
ssh "$SSH_HOST" "sudo systemctl stop $SERVICE_NAME 2>/dev/null || true"

# Create app directory
ssh "$SSH_HOST" "sudo mkdir -p $REMOTE_APP_DIR && sudo chown $REMOTE_USER:$REMOTE_USER $REMOTE_APP_DIR"

# Upload AppImage
echo -e "${BLUE}Uploading AppImage...${NC}"
scp "$APPIMAGE" "$SSH_HOST:$REMOTE_APP_DIR/homelab-dashboard.AppImage"
ssh "$SSH_HOST" "chmod +x $REMOTE_APP_DIR/homelab-dashboard.AppImage"

# Config
echo -e "${BLUE}Setting up configuration directory...${NC}"
ssh "$SSH_HOST" "sudo mkdir -p $REMOTE_CONFIG_DIR"
if ssh "$SSH_HOST" "[ ! -f $REMOTE_CONFIG_DIR/config.json ]"; then
    if [ -f "config.json" ]; then
        echo -e "${BLUE}Uploading initial config.json...${NC}"
        scp "config.json" "$SSH_HOST:/tmp/config.json"
        ssh "$SSH_HOST" "sudo mv /tmp/config.json $REMOTE_CONFIG_DIR/config.json"
    else
        echo -e "${YELLOW}No config.json found locally. Create one on the Pi at $REMOTE_CONFIG_DIR/config.json${NC}"
        echo -e "${YELLOW}See config.example.json for the required format.${NC}"
    fi
else
    echo -e "${YELLOW}Config already exists on Pi — not overwriting.${NC}"
fi

# Install systemd service
echo -e "${BLUE}Installing systemd service...${NC}"
if [ -f "homelab-dashboard.service" ]; then
    scp "homelab-dashboard.service" "$SSH_HOST:/tmp/$SERVICE_NAME.service"
    ssh "$SSH_HOST" "sudo mv /tmp/$SERVICE_NAME.service /etc/systemd/system/$SERVICE_NAME.service && sudo systemctl daemon-reload"
fi

# Enable and start
echo -e "${BLUE}Enabling and starting service...${NC}"
ssh "$SSH_HOST" "sudo systemctl enable $SERVICE_NAME && sudo systemctl start $SERVICE_NAME"

sleep 2
if ssh "$SSH_HOST" "sudo systemctl is-active --quiet $SERVICE_NAME"; then
    echo -e "${GREEN}Deployment successful! Service is running on $SSH_HOST.${NC}"
    echo ""
    echo "Useful commands:"
    echo "  Logs:    ssh $SSH_HOST 'sudo journalctl -u $SERVICE_NAME -f'"
    echo "  Stop:    ssh $SSH_HOST 'sudo systemctl stop $SERVICE_NAME'"
    echo "  Restart: ssh $SSH_HOST 'sudo systemctl restart $SERVICE_NAME'"
    echo "  Status:  ssh $SSH_HOST 'sudo systemctl status $SERVICE_NAME'"
else
    echo -e "${RED}Service may not be running. Check logs:${NC}"
    echo "  ssh $SSH_HOST 'sudo journalctl -u $SERVICE_NAME -n 50'"
    exit 1
fi
