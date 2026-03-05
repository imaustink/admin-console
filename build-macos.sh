#!/bin/bash

# Build script for macOS
# This script compiles TypeScript and packages the Electron app for macOS (x64 and arm64)

set -e

echo "🔨 Building Homelab Dashboard for macOS..."

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

# Build for macOS (both Intel and Apple Silicon)
echo -e "${BLUE}Packaging for macOS (Universal)...${NC}"
npm run build:macos

# Check if build was successful
if [ ! -d "build/mac" ] && [ ! -d "build/mac-universal" ]; then
    echo -e "${RED}❌ Electron Builder failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build complete!${NC}"
echo -e "${GREEN}Build artifacts:${NC}"

# List the build outputs
if [ -d "build/mac" ]; then
    echo -e "${BLUE}  - build/mac/Homelab Dashboard.app${NC}"
fi

if [ -d "build/mac-universal" ]; then
    echo -e "${BLUE}  - build/mac-universal/Homelab Dashboard.app${NC}"
fi

if [ -f "build/"*.dmg ]; then
    for dmg in build/*.dmg; do
        echo -e "${BLUE}  - $dmg ($(du -h "$dmg" | cut -f1))${NC}"
    done
fi

if [ -f "build/"*-mac.zip ]; then
    for zip in build/*-mac.zip; do
        echo -e "${BLUE}  - $zip ($(du -h "$zip" | cut -f1))${NC}"
    done
fi

echo -e "${GREEN}📦 Ready for distribution!${NC}"
