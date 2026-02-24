#!/bin/bash

# Build script for 64-bit Raspberry Pi OS Trixie
# This script compiles TypeScript and packages the Electron app for ARM64 architecture

set -e

echo "🔨 Building Homelab Dashboard for Raspberry Pi (ARM64)..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Clean previous builds
echo -e "${BLUE}Cleaning previous builds...${NC}"
rm -rf dist/ build/

# Compile TypeScript
echo -e "${BLUE}Compiling TypeScript...${NC}"
npm run build

# Check if compilation was successful
if [ ! -d "dist" ]; then
    echo -e "${RED}❌ TypeScript compilation failed${NC}"
    exit 1
fi

# Build for ARM64 Linux
echo -e "${BLUE}Packaging for ARM64 Linux (Raspberry Pi)...${NC}"
npm run build:rpi

# Check if build was successful
if [ ! -d "build/linux-arm64-unpacked" ]; then
    echo -e "${RED}❌ Electron Builder failed${NC}"
    exit 1
fi

# Create a tarball for easy deployment
echo -e "${BLUE}Creating deployment package...${NC}"
cd build/linux-arm64-unpacked
tar -czf ../homelab-dashboard-rpi-arm64.tar.gz .
cd ../..

echo -e "${GREEN}✅ Build complete!${NC}"
echo -e "${GREEN}Package location: build/homelab-dashboard-rpi-arm64.tar.gz${NC}"
echo -e "${BLUE}Size: $(du -h build/homelab-dashboard-rpi-arm64.tar.gz | cut -f1)${NC}"
