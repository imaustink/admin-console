# Quick Start Guide

Get up and running with the Homelab Dashboard in 5 minutes.

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Your UniFi Controller

```bash
cp config.example.json config.json
```

Edit `config.json`:
```json
{
  "host": "192.168.1.1",
  "port": 8443,
  "username": "admin",
  "password": "yourpassword",
  "site": "default"
}
```

Replace with your actual UniFi controller details.

## 3. Run in Test Mode (Optional)

To test without connecting to real devices:

```bash
npm run test-mode
```

This will use mock data for UniFi and Kubernetes.

## 4. Run the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

## 5. Navigate the Dashboard

The application opens in fullscreen with three main tabs:

### UniFi Tab
- View all your UniFi devices
- Check device status, IP addresses, and uptime
- Power cycle devices
- Update firmware

### Kubernetes Tab
- View cluster nodes
- Check node health and capacity
- Drain/cordon/uncordon nodes
- Power cycle nodes via port mapping

### Status Tab
- Overall system health
- Internet connectivity statistics
- HTTP endpoint health checks
- Resource availability

## Tips

- Press the **Refresh** button in each tab to reload data
- Use the **Exit** button in the top-right to close the application
- Check the `logs/` directory for detailed application logs
- Run in test mode first to familiarize yourself with the interface

## Troubleshooting

### Can't connect to UniFi Controller
- Verify your `config.json` settings
- Ensure the controller is accessible from your network
- Check if you need to accept the self-signed certificate

### Kubernetes features not working
- Ensure `kubectl` is installed and configured
- Verify you have the correct kubeconfig set up
- Check cluster connectivity

### Application won't start
- Check the logs in the `logs/` directory
- Ensure all dependencies are installed: `npm install`
- Try in test mode first: `npm run test-mode`

## Next Steps

- Customize health check endpoints in the Status tab
- Set up automatic refresh intervals
- Configure additional K8s resource monitoring

For more details, see the full [README.md](README.md).
