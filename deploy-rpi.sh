#!/bin/bash

# Deploy script for Homelab Dashboard to Raspberry Pi
# Uses SSH config named "console" to deploy the application

set -e

# Configuration
SSH_HOST="console"
REMOTE_USER="pi"
REMOTE_APP_DIR="/opt/homelab-dashboard"
REMOTE_CONFIG_DIR="/etc/homelab-dashboard"
SERVICE_NAME="homelab-dashboard"
BUILD_PACKAGE="build/homelab-dashboard-rpi-arm64.tar.gz"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "🚀 Deploying Homelab Dashboard to Raspberry Pi..."

# Check if build package exists
if [ ! -f "$BUILD_PACKAGE" ]; then
    echo -e "${RED}❌ Build package not found: $BUILD_PACKAGE${NC}"
    echo -e "${YELLOW}Run './build-rpi.sh' first to create the package${NC}"
    exit 1
fi

# Test SSH connection
echo -e "${BLUE}Testing SSH connection to $SSH_HOST...${NC}"
if ! ssh -o ConnectTimeout=5 "$SSH_HOST" "echo 'Connection successful'" > /dev/null 2>&1; then
    echo -e "${RED}❌ Cannot connect to $SSH_HOST${NC}"
    echo -e "${YELLOW}Make sure your SSH config has an entry named 'console'${NC}"
    exit 1
fi

# Stop the service if it's running
echo -e "${BLUE}Stopping existing service...${NC}"
ssh "$SSH_HOST" "sudo systemctl stop $SERVICE_NAME 2>/dev/null || true"

# Create application directory
echo -e "${BLUE}Creating application directory...${NC}"
ssh "$SSH_HOST" "sudo mkdir -p $REMOTE_APP_DIR && sudo chown $REMOTE_USER:$REMOTE_USER $REMOTE_APP_DIR"

# Backup existing installation
echo -e "${BLUE}Backing up existing installation...${NC}"
ssh "$SSH_HOST" "if [ -d $REMOTE_APP_DIR/homelab-dashboard ]; then sudo mv $REMOTE_APP_DIR/homelab-dashboard $REMOTE_APP_DIR/homelab-dashboard.backup.\$(date +%Y%m%d_%H%M%S); fi"

# Upload the package
echo -e "${BLUE}Uploading package...${NC}"
scp "$BUILD_PACKAGE" "$SSH_HOST:/tmp/homelab-dashboard.tar.gz"

# Extract the package
echo -e "${BLUE}Extracting package...${NC}"
ssh "$SSH_HOST" "cd $REMOTE_APP_DIR && tar -xzf /tmp/homelab-dashboard.tar.gz && rm /tmp/homelab-dashboard.tar.gz"

# Create config directory if it doesn't exist
echo -e "${BLUE}Setting up configuration directory...${NC}"
ssh "$SSH_HOST" "sudo mkdir -p $REMOTE_CONFIG_DIR"

# Upload config.json only if it doesn't exist on the Pi
if ssh "$SSH_HOST" "[ ! -f $REMOTE_CONFIG_DIR/config.json ]"; then
    if [ -f "config.json" ]; then
        echo -e "${BLUE}Uploading initial configuration file...${NC}"
        scp "config.json" "$SSH_HOST:/tmp/config.json"
        ssh "$SSH_HOST" "sudo mv /tmp/config.json $REMOTE_CONFIG_DIR/config.json"
    else
        echo -e "${YELLOW}⚠️  No config.json found locally. You'll need to create one on the Pi.${NC}"
        echo -e "${YELLOW}   Template available at: config.example.json${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Config file already exists on Pi - not overwriting.${NC}"
    echo -e "${YELLOW}   To update config, edit it directly on the Pi or delete it first.${NC}"
fi

# Upload and install systemd service
echo -e "${BLUE}Installing systemd service...${NC}"
if [ -f "homelab-dashboard.service" ]; then
    scp "homelab-dashboard.service" "$SSH_HOST:/tmp/$SERVICE_NAME.service"
    ssh "$SSH_HOST" "sudo mv /tmp/$SERVICE_NAME.service /etc/systemd/system/$SERVICE_NAME.service"
    ssh "$SSH_HOST" "sudo systemctl daemon-reload"
else
    echo -e "${YELLOW}⚠️  Service file not found. Skipping service installation.${NC}"
fi

# Set proper permissions
echo -e "${BLUE}Setting permissions...${NC}"
ssh "$SSH_HOST" "sudo chmod +x $REMOTE_APP_DIR/homelab-dashboard && sudo chown -R $REMOTE_USER:$REMOTE_USER $REMOTE_APP_DIR"

# Enable and start the service
echo -e "${BLUE}Enabling and starting service...${NC}"
ssh "$SSH_HOST" "sudo systemctl enable $SERVICE_NAME && sudo systemctl start $SERVICE_NAME"

# Check service status
sleep 2
echo -e "${BLUE}Checking service status...${NC}"
if ssh "$SSH_HOST" "sudo systemctl is-active --quiet $SERVICE_NAME"; then
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo -e "${GREEN}Service is running on $SSH_HOST${NC}"
    echo ""
    echo -e "${BLUE}Useful commands:${NC}"
    echo -e "  View logs:    ssh $SSH_HOST 'sudo journalctl -u $SERVICE_NAME -f'"
    echo -e "  Stop service: ssh $SSH_HOST 'sudo systemctl stop $SERVICE_NAME'"
    echo -e "  Restart:      ssh $SSH_HOST 'sudo systemctl restart $SERVICE_NAME'"
    echo -e "  Status:       ssh $SSH_HOST 'sudo systemctl status $SERVICE_NAME'"
else
    echo -e "${RED}⚠️  Service might not be running properly${NC}"
    echo -e "${YELLOW}Check logs with: ssh $SSH_HOST 'sudo journalctl -u $SERVICE_NAME -n 50'${NC}"
    exit 1
fi
