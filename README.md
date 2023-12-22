# Admin Console

This app is intended to provide a physical console for basic network administration and diagnostic tasks.

# Develop

Create a `.env` file in the root of the repo:
```
UNIFI_USERNAME=[USERNAME GOES HERE]
UNIFI_PASSWORD=[PASSWORD GOES HERE]
UNIFI_URL=https://192.168.1.1
```

Start dev server:

`npm run dev`

Start electron app in dev mode:

`npm start`

# Deployment

Run `./deploy`

This script assumes a target devise is available via the hostname `console` with the username `admin` and the default SSH key will be used.

The app will be packaged for arm64 Linux by default. I used Debian Bullseye 64-bit on my Pi 3.

# Launch on startup

Use nano to open the following file path:

`sudo nano /lib/systemd/system/admin-console.service`

Paste this in and update the username and password:

```
[Unit]
Description=Start Admin Console
After=graphical.target

[Service]
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/pi/.Xauthority
Environment=UNIFI_USERNAME=[USERNAME GOES HERE]
Environment=UNIFI_PASSWORD=[PASSWORD GOES HERE]
Environment=UNIFI_URL=https://192.168.1.1
ExecStart=/opt/admin-console/admin-console --no-sandbox
Type=simple
Restart=on-failure
RestartSec=10s
KillMode=process
TimeoutSec=infinity
User=admin

[Install]
WantedBy=graphical.target
```

Reload systemd:

`sudo systemctl daemon-reload`

Enable our service:

`sudo systemctl enable admin-console.service`