# Homelab Dashboard

An Electron-based dashboard for managing your homelab infrastructure, including UniFi devices, Kubernetes clusters, and system health monitoring.

## Features

- **UniFi Controller Integration**: View and manage UniFi network devices
  - Device status and information
  - Power cycling
  - Firmware updates
  
- **Kubernetes Management**: Monitor and control K8s cluster nodes
  - Node status and health
  - Drain/cordon/uncordon operations
  - Resource health checks
  - Port mapping management

- **System Status**: Centralized health monitoring
  - Internet connectivity stats
  - HTTP endpoint health checks
  - Resource availability monitoring

## Prerequisites

- Node.js 18+ and npm
- Access to UniFi Controller
- Kubernetes cluster with kubectl configured (optional)

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the example config and fill in your details:
   ```bash
   cp config.example.json config.json
   ```

4. Edit `config.json` with your UniFi controller credentials

## Configuration

Edit `config.json`:

```json
{
  "unifi": {
    "host": "unifi.local",
    "port": 8443,
    "username": "admin",
    "password": "your-password-here",
    "site": "default"
  },
  "kubernetes": {
    "cluster": "https://192.168.1.100:6443",
    "token": "your-service-account-token",
    "skipTLSVerify": false
  }
}
```

### Kubernetes Authentication

The dashboard supports two authentication methods:

1. **Service Account Token** (recommended): See [K8S_TOKEN_SETUP.md](K8S_TOKEN_SETUP.md) for instructions
2. **Kubeconfig**: Omit the `kubernetes` section to use default kubeconfig

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for instructions on deploying to a Raspberry Pi.

## Auto-Updates

The application supports automatic updates via GitHub Releases. Users will be notified when a new version is available and can update with a single click.

See [AUTO_UPDATE_SETUP.md](AUTO_UPDATE_SETUP.md) for:
- Setting up GitHub Releases
- Publishing updates
- Code signing requirements
- Testing auto-updates

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Test Mode (with mock data)
```bash
npm run test-mode
```

## Development

The application is built with:
- **Electron**: Desktop application framework
- **TypeScript**: Type-safe JavaScript
- **Winston**: Logging framework

### Project Structure

```
src/
  ├── main.ts           # Electron main process
  ├── preload.ts        # Preload script for context bridge
  ├── renderer.ts       # Renderer process logic
  ├── types.ts          # TypeScript type definitions
  ├── controllers/      # Business logic controllers
  │   ├── unifi.ts
  │   ├── k8s.ts
  │   ├── status.ts
  │   ├── port-mapper.ts
  │   └── mock/         # Mock controllers for testing
  ├── fixtures/         # Test data fixtures
  └── utils/            # Utility functions
      └── logger.ts
```

## Logs

Application logs are written to the `logs/` directory with timestamps. Each application run creates a new log file.

## License

MIT
