# Auto-Update Setup Guide

This application now supports automatic updates using GitHub Releases. When you publish a new version to GitHub Releases, users will be automatically notified and can update with a single click.

## Prerequisites

### 1. GitHub Repository Setup

1. Create a GitHub repository for your project if you haven't already
2. Update `package.json` with your GitHub username:
   ```json
   "repository": {
     "type": "git",
     "url": "https://github.com/YOUR_USERNAME/homelab-dashboard.git"
   },
   "build": {
     ...
     "publish": [
       {
         "provider": "github",
         "owner": "YOUR_USERNAME",
         "repo": "homelab-dashboard"
       }
     ]
   }
   ```

3. Generate a GitHub Personal Access Token:
   - Go to: https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Select scopes: `repo` (Full control of private repositories)
   - Copy the token

### 2. Code Signing (Important for macOS)

#### macOS

**For Public Distribution:**
- Requires an Apple Developer account ($99/year)
- Set up code signing certificate in Keychain
- Without signing, macOS Gatekeeper will block auto-updates

**For Personal Use (Workaround - Already Configured):**
- ✅ **No Apple Developer account needed!**
- The app is configured with `"identity": null` in package.json
- Signature verification is disabled in the code
- This is **safe for personal projects** but **not** for public distribution
- You'll see a warning on first launch, but auto-updates will work

**What happens without a Developer account:**
- First time you run the app: Right-click → Open (bypass Gatekeeper)
- After that: Auto-updates work normally
- macOS will show "unidentified developer" warning (this is normal)

#### Windows
- Recommended but not required
- Can use self-signed certificate for testing
- Production apps should use a proper certificate

#### Linux
- Not required

## How to Publish a Release

### Step 1: Update Version

Update the version in `package.json`:
```json
{
  "version": "1.1.0"
}
```

### Step 2: Build and Publish

Set your GitHub token as an environment variable:
```bash
export GH_TOKEN="your_github_token_here"
```

Build and publish to GitHub Releases:

**For macOS:**
```bash
npm run build:macos
npx electron-builder --mac --universal --publish always
```

**For Raspberry Pi (Linux ARM64):**
```bash
npm run build:rpi
npx electron-builder --linux --arm64 --publish always
```

**For both platforms:**
```bash
# Build both and publish
npm run build
npx electron-builder --mac --universal --linux --arm64 --publish always
```

### Step 3: Verify Release

1. Go to your GitHub repository
2. Click on "Releases"
3. You should see your new version with the build artifacts
4. The auto-update system will use these artifacts

## How Auto-Update Works

### User Experience

1. **On App Launch**: The app checks for updates after 3 seconds
2. **Update Available**: A modal appears showing the new version
3. **Download**: User clicks "Download" to download the update in the background
4. **Progress**: A progress bar shows download status
5. **Install**: When complete, user clicks "Install & Restart" to update
6. **Automatic**: On next quit, the update is applied

### Developer Configuration

The auto-update system is configured in `src/main.ts`:

```typescript
autoUpdater.autoDownload = false; // Requires user confirmation
autoUpdater.autoInstallOnAppQuit = true; // Installs when app quits
```

### Update Channels

By default, electron-updater checks for the latest release. You can configure channels:

```typescript
autoUpdater.channel = 'beta'; // Check for beta releases
```

Then publish releases with specific channels:
```bash
npx electron-builder --publish always --prerelease
```

## Testing Auto-Updates

### Local Testing

1. **Build current version**:
   ```bash
   npm run package:macos
   ```

2. **Install the app** from `build/` directory

3. **Update version in package.json** (e.g., 1.0.0 → 1.0.1)

4. **Build and publish to GitHub**:
   ```bash
   export GH_TOKEN="your_token"
   npx electron-builder --mac --universal --publish always
   ```

5. **Run the installed app** - it should detect the update

### Test Mode

The app skips update checks in test mode and development:
```bash
# Updates disabled in test mode
npm run test-mode

# Updates disabled in development
NODE_ENV=development npm start
```

## Deployment Notes

### Raspberry Pi Deployment

For Raspberry Pi, you might want to continue using your existing `deploy-rpi.sh` script for manual updates since:
- It's a single-instance homelab deployment
- You have direct SSH access
- Auto-updates add complexity for single-device scenarios

However, if you manage multiple Raspberry Pi devices, auto-updates become valuable.

### Production Settings

For production deployments, update the main process to enable updates:

```typescript
// Only check for updates in production
if (process.env.NODE_ENV === 'production') {
  autoUpdater.checkForUpdates();
}
```

## Troubleshooting

### Updates Not Detected

1. **Check your GitHub token** has `repo` scope
2. **Verify package.json** has correct repository information
3. **Check build artifacts** are uploaded to GitHub Releases
4. **Look at logs** in the app's log directory

### macOS "Update is damaged" Error

- This means the app isn't code signed
- You need an Apple Developer account
- Sign the app with your certificate

### Update Download Fails

- Check internet connectivity
- Verify GitHub Release has correct file format
- Check the console/logs for specific error messages

## Security Considerations

1. **Always use HTTPS** for update servers (GitHub uses HTTPS)
2. **Code signing** provides authenticity verification
3. **Keep your GH_TOKEN secret** - never commit it to git
4. **electron-updater verifies** signature automatically on macOS/Windows

## Advanced Configuration

### Custom Update Server

If you want to host updates on your own server instead of GitHub:

```json
"build": {
  "publish": [
    {
      "provider": "generic",
      "url": "https://your-server.com/updates"
    }
  ]
}
```

### Auto-Download Updates

To download updates automatically without user confirmation:

```typescript
autoUpdater.autoDownload = true;
```

### Check for Updates on Demand

Add a "Check for Updates" menu item:

```typescript
ipcMain.handle('update:checkNow', async () => {
  return await autoUpdater.checkForUpdates();
});
```

## Resources

- [electron-updater Documentation](https://www.electron.build/auto-update)
- [electron-builder Publishing](https://www.electron.build/configuration/publish)
- [Code Signing Guide](https://www.electron.build/code-signing)

## Support

If you encounter issues with auto-updates:
1. Check the application logs in `logs/` directory
2. Review GitHub Actions/releases for build errors
3. Test with smaller version increments first
4. Verify your code signing setup (macOS)
