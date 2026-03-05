# Raspberry Pi Deployment Guide

This guide explains how to build, deploy, and run the Homelab Dashboard on a 64-bit Raspberry Pi running Raspberry Pi OS Trixie.

## Prerequisites

### On Your Development Machine
- Node.js 18+ and npm
- SSH access to your Raspberry Pi configured with the name "console"

### On Your Raspberry Pi
- 64-bit Raspberry Pi OS Trixie
- SSH server enabled
- Sudo privileges for the deployment user (default: pi)

## SSH Configuration

Add the following to your `~/.ssh/config` file:

```
Host console
    HostName 192.168.1.xxx  # Replace with your Pi's IP address
    User pi
    IdentityFile ~/.ssh/id_rsa  # Optional: specify your SSH key
    Port 22
```

Test your connection:
```bash
ssh console
```

## Installation Steps

### 1. Install Dependencies (First Time Only)

```bash
npm install
```

This will install electron-builder and all required dependencies.

### 2. Create Configuration File

Copy the example configuration and customize it:

```bash
cp config.example.json config.json
```

Edit `config.json` with your UniFi and Kubernetes credentials.

#### Kubernetes Configuration

The dashboard supports two methods for connecting to Kubernetes:

**Option 1: Service Account Token (Recommended for Production)**
- More secure and portable
- See [K8S_TOKEN_SETUP.md](K8S_TOKEN_SETUP.md) for detailed setup instructions
- Add the following to `config.json`:

```json
{
  "kubernetes": {
    "cluster": "https://192.168.1.100:6443",
    "token": "eyJhbGciOiJSUzI1NiIsImtpZCI6...",
    "caData": "LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t...",
    "skipTLSVerify": false
  }
}
```

**Option 2: Default Kubeconfig**
- Simply omit the `kubernetes` section from `config.json`
- The app will use `~/.kube/config` or `$KUBECONFIG`
- Requires kubeconfig to be set up on the Raspberry Pi

### 3. Build for Raspberry Pi

Run the build script to compile and package the application:

```bash
./build-rpi.sh
```

This will:
- Compile TypeScript files
- Package the Electron app for ARM64 architecture
- Create a compressed tarball at `build/homelab-dashboard-rpi-arm64.tar.gz`

### 4. Deploy to Raspberry Pi

Run the deployment script:

```bash
./deploy-rpi.sh
```

This will:
- Upload the application package to your Pi
- Extract it to `/opt/homelab-dashboard`
- Upload your configuration file to `/etc/homelab-dashboard/config.json`
- Install and start the systemd service
- Enable the service to start on boot

## Managing the Service

### View Service Status
```bash
ssh console 'sudo systemctl status homelab-dashboard'
```

### View Live Logs
```bash
ssh console 'sudo journalctl -u homelab-dashboard -f'
```

### View Recent Logs
```bash
ssh console 'sudo journalctl -u homelab-dashboard -n 100'
```

### Restart Service
```bash
ssh console 'sudo systemctl restart homelab-dashboard'
```

### Stop Service
```bash
ssh console 'sudo systemctl stop homelab-dashboard'
```

### Start Service
```bash
ssh console 'sudo systemctl start homelab-dashboard'
```

### Disable Auto-Start
```bash
ssh console 'sudo systemctl disable homelab-dashboard'
```

## File Locations on Raspberry Pi

- **Application**: `/opt/homelab-dashboard/`
- **Configuration**: `/etc/homelab-dashboard/config.json`
- **Service File**: `/etc/systemd/system/homelab-dashboard.service`
- **Logs**: Use `journalctl` commands above

## Updating the Application

To update the application after making changes:

1. Build the new version:
   ```bash
   ./build-rpi.sh
   ```

2. Deploy the update:
   ```bash
   ./deploy-rpi.sh
   ```

The deploy script will automatically:
- Backup the previous version
- Stop the service
- Deploy the new version
- Restart the service

## Troubleshooting

### Service Won't Start
Check the logs:
```bash
ssh console 'sudo journalctl -u homelab-dashboard -n 50'
```

Common issues:
- Missing or invalid configuration file
- Incorrect permissions
- Display environment issues (if running with a GUI)

### Configuration Changes
After modifying `/etc/homelab-dashboard/config.json` on the Pi:
```bash
ssh console 'sudo systemctl restart homelab-dashboard'
```

### Rollback to Previous Version
If a deployment fails, the previous version is backed up:
```bash
ssh console 'sudo systemctl stop homelab-dashboard'
ssh console 'cd /opt/homelab-dashboard && sudo rm -rf * && sudo cp -r homelab-dashboard.backup.* .'
ssh console 'sudo systemctl start homelab-dashboard'
```

## Customizing the Service

The systemd service file is located at [homelab-dashboard.service](homelab-dashboard.service).

To modify service settings:
1. Edit the service file locally
2. Run `./deploy-rpi.sh` to apply changes

Key service parameters you might want to adjust:
- **User/Group**: Change from `pi` if using a different user
- **Environment**: Add custom environment variables
- **Restart**: Modify restart behavior
- **Resource Limits**: Adjust memory and CPU limits if needed

## NPM Scripts

- `npm run build` - Compile TypeScript
- `npm run build:rpi` - Package for ARM64 Linux
- `npm run package:rpi` - Run the full build script
- `npm run deploy:rpi` - Run the deployment script
- `npm start` - Run locally for testing
- `npm run dev` - Development mode

## Security Notes

- The service runs with `NoNewPrivileges=true` for enhanced security
- Configuration files should have restricted permissions (600 or 640)
- Consider using SSH keys instead of passwords for deployment
- Keep your Pi's OS and packages updated

## Performance Considerations

For Raspberry Pi 3 or older models:
- The build might take longer due to limited CPU resources
- Consider building on a more powerful machine and deploying
- You may need to adjust the `RestartSec` value in the service file if the Pi is slow to start

For Raspberry Pi 4 and newer:
- Should run smoothly with default settings
- May benefit from increased `LimitNOFILE` if managing many devices
