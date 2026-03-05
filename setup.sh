#!/bin/bash

# Homelab Dashboard Setup Script
# This script automates the initial setup of the application

set -e

echo "🚀 Setting up Homelab Dashboard..."
echo ""

# Check Node.js installation
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check npm installation
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi

echo "✅ npm $(npm -v) detected"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""

# Create config file if it doesn't exist
if [ ! -f config.json ]; then
    echo "📝 Creating config.json from example..."
    cp config.example.json config.json
    echo "✅ config.json created"
    echo ""
    echo "⚠️  Please edit config.json with your UniFi controller details:"
    echo "   - host: Your UniFi controller hostname/IP"
    echo "   - port: Controller port (usually 8443)"
    echo "   - username: Controller admin username"
    echo "   - password: Controller admin password"
    echo "   - site: Site name (usually 'default')"
    echo ""
else
    echo "✅ config.json already exists"
    echo ""
fi

# Create logs directory
if [ ! -d logs ]; then
    mkdir logs
    echo "✅ Created logs directory"
else
    echo "✅ Logs directory exists"
fi

echo ""
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit config.json with your UniFi controller details"
echo "  2. Run 'npm run test-mode' to test with mock data"
echo "  3. Run 'npm run dev' to start in development mode"
echo "  4. Run 'npm run build && npm start' for production"
echo ""
echo "For more information, see README.md or QUICKSTART.md"
