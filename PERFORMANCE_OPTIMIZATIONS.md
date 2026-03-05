# Performance Optimizations for Raspberry Pi 3

## Overview
This document describes the performance optimizations applied to improve the dashboard's performance on Raspberry Pi 3 with an 800x480 touchscreen running Raspberry Pi OS 64-bit Trixie.

## Changes Made

### 1. Electron Configuration Optimizations

#### Hardware Acceleration Disabled
- **Added**: `app.disableHardwareAcceleration()`
- **Reason**: The Pi 3's VideoCore IV GPU struggles with Chromium's hardware acceleration. Software rendering is often faster on this device.

#### Command-Line Flags
Added the following Electron command-line switches:
- `--disable-gpu`: Disables GPU process
- `--disable-software-rasterizer`: Prevents fallback to software rasterizer
- `--disable-gpu-compositing`: Disables GPU-accelerated compositing
- `--enable-low-end-device-mode`: Enables optimizations for low-end devices
- `--disable-smooth-scrolling`: Disables smooth scrolling animations
- `--disable-features=VizDisplayCompositor`: Disables Viz display compositor for better performance

#### WebPreferences Configuration
- Disabled `enableWebSQL` (not needed)
- Set `backgroundThrottling: false` to prevent unexpected throttling

### 2. CSS Performance Improvements

#### Removed GPU-Intensive Effects
- **Gradients**: Replaced `linear-gradient()` backgrounds with solid colors
- **Box Shadows**: Reduced or removed box-shadow effects, replaced with simple borders
- **Transforms**: Removed `translateY()` hover effects that trigger repaints

#### Disabled Animations
- Removed all `transition` properties from buttons and interactive elements
- Removed `transform` animations on hover states
- Simplified hover effects to use opacity or border color changes only

#### Scrolling Optimizations
- Added `will-change: transform` and `transform: translateZ(0)` to cards for better scrolling
- Set `scroll-behavior: auto` to disable smooth scrolling
- Optimized scrollbar styling (removed border-radius for simpler rendering)
- Added `-webkit-overflow-scrolling: touch` for better touch scrolling

#### CSS Containment
Added `contain` property to optimize layout calculation:
- `.container`: `contain: layout`
- `main`: `contain: layout style`
- `.tab-content`: `contain: layout style paint`
- `.device-grid`, `.status-grid`: `contain: layout style`

This tells the browser that elements are independent, reducing reflow calculations.

### 3. Rendering Optimizations
- Added `-webkit-font-smoothing: antialiased` for better text rendering
- Simplified scrollbar appearance (removed border-radius)

## Expected Improvements

1. **Faster Scrolling**: Removing animations and GPU effects should make scrolling much smoother
2. **Faster Tab Switching**: Reduced repaints and containment optimizations
3. **Lower CPU Usage**: Software rendering optimized for ARM architecture
4. **Better Touch Responsiveness**: Removed transition delays on touch events

## Deployment

After making these changes, rebuild and redeploy:

```bash
npm run build && ./build-rpi.sh && ./deploy-rpi.sh
```

## Additional Recommendations

### System-Level Optimizations

1. **Reduce Resolution** (if possible):
   - The 800x480 resolution is relatively low, but consider checking if the Pi is rendering at a higher resolution and scaling down

2. **Disable Desktop Effects**:
   - Since you're using labwc (Wayland compositor), minimize other visual effects
   - Consider running the app in kiosk mode without other UI elements

3. **Increase GPU Memory**:
   - Edit `/boot/firmware/config.txt` (or `/boot/config.txt` on older systems)
   - Add or modify: `gpu_mem=256` (allocate more memory to GPU)

4. **Overclock** (optional, increases temperature):
   ```
   # Add to /boot/firmware/config.txt
   over_voltage=2
   arm_freq=1300
   ```
   **Warning**: Only if you have adequate cooling

5. **Disable Unused Services**:
   ```bash
   # Check what's running
   systemctl list-unit-files --state=enabled
   
   # Disable unnecessary services to free up resources
   ```

### Application-Level Optimizations

1. **Reduce Polling Frequency** (if auto-refresh is added):
   - Keep refresh intervals at 30+ seconds minimum
   - Only refresh the active tab

2. **Limit Visible Items**:
   - If you have many devices/nodes, consider pagination
   - Show max 12 cards at a time

3. **Lazy Load Images** (if any are added in future):
   - Use intersection observer for lazy loading

## Testing

After deploying, test the following:
1. Scroll through device lists - should be much smoother
2. Switch between tabs - should be instant
3. Touch interactions - should feel more responsive
4. Monitor CPU usage: `htop` on the Pi (should see lower usage)

## Troubleshooting

### If performance is still poor:

1. **Check System Resources**:
   ```bash
   ssh console "htop"
   ```
   Look for other processes consuming CPU/RAM

2. **Check Temperature**:
   ```bash
   ssh console "vcgencmd measure_temp"
   ```
   If over 70°C, the Pi may be throttling

3. **Verify GPU Memory**:
   ```bash
   ssh console "vcgencmd get_mem gpu"
   ```

4. **Check for Throttling**:
   ```bash
   ssh console "vcgencmd get_throttled"
   ```
   `0x0` means no throttling; other values indicate issues

### Further Optimizations

If still slow, consider:
- Reducing grid columns from 3 to 2 for less DOM complexity
- Removing unused CSS media queries
- Minifying CSS and JS in production build
- Using a lighter font stack

## Rollback

If these changes cause issues, revert with:
```bash
git checkout HEAD -- src/main.ts styles.css
```

## Notes

- These optimizations prioritize performance over visual polish
- Some visual effects (shadows, gradients, animations) were sacrificed
- The app should now be significantly more responsive on Pi 3 hardware
