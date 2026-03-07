# Homelab Dashboard - Copilot Instructions

Keep an eye out for opportunities to update this file with helpful architectural documentation, coding patterns, and best practices for the project. This file should serve as a comprehensive guide for current and future contributors to understand the structure and conventions of the codebase.

Be careful not to create extraneous readme files when making changes. Keep documentation concise and try to keep it in the main readme, only creating new readmes when you have a strong reason to create separate documentation.

Make sure to add secret files to the .gitignore and never include sensitive information in the repository. Use environment variables or secure vaults for managing secrets.

## Project Architecture

This is a **Tauri 2 + Svelte** dashboard application for managing a homelab environment with UniFi network devices and Kubernetes clusters.

### Tech Stack
- **Framework**: Tauri 2 (Rust backend + WebView frontend)
- **Backend Language**: Rust (all business logic, HTTP clients, SSH execution)
- **Frontend Language**: TypeScript + Svelte 4 + Vite 5
- **Target Platform**: Raspberry Pi 4 (aarch64 / ARM64)
- **UI**: Svelte components with minimal dark-theme CSS inspired by Vercel design language (no heavy JS frameworks)

### Project Structure

```
src/                       # Svelte frontend (TypeScript)
├── main.ts                # Svelte app entry point
├── app.css                # Global dark-theme styles
├── App.svelte             # Root component (tabs, update check)
└── lib/
    ├── api.ts             # Typed Tauri invoke() wrappers
    ├── types.ts           # Shared TypeScript types
    └── components/
        ├── UnifiDevices.svelte
        ├── K8sNodes.svelte
        ├── SystemStatus.svelte
        └── modals/
            ├── CommandModal.svelte
            ├── AptModal.svelte
            └── UpdateModal.svelte

src-tauri/                 # Rust backend (Tauri)
├── Cargo.toml
├── tauri.conf.json
├── capabilities/
│   └── default.json       # Tauri v2 permission grants
├── icons/                 # App icons (RGBA PNG required)
└── src/
    ├── main.rs            # Rust entry point (sets GPU env vars for Pi 4)
    ├── lib.rs             # All #[tauri::command] definitions + app builder
    ├── mock.rs            # Mock data returned when MOCK_MODE=1 or MOCK=1
    ├── config.rs          # Config loading (env var → dev path → XDG)
    ├── types.rs           # Rust types with serde Serialize/Deserialize
    ├── state.rs           # AppState (Arc<Mutex<UnifiClient>> + cache)
    └── controllers/
        ├── mod.rs
        ├── unifi.rs       # UniFi HTTP client (reqwest + cookie auth)
        ├── k8s.rs         # K8s REST API client + SSH via tokio::process
        └── port_mapper.rs # Maps K8s nodes to UniFi switch ports
```

## Key Architectural Patterns

### 1. IPC Communication Flow (Tauri)

**Flow**: Svelte component → `src/lib/api.ts` → Tauri `invoke()` → Rust `#[tauri::command]` → Controller

1. **Controller** (`src-tauri/src/controllers/*.rs`): Implement logic using reqwest/tokio
   ```rust
   pub async fn do_something(&mut self, param: &str) -> Result<MyType> {
       // reqwest HTTP or tokio::process::Command
   }
   ```

2. **Tauri command** (`src-tauri/src/lib.rs`): Expose as a command
   ```rust
   #[tauri::command]
   async fn my_command(param: String, state: State<'_, AppState>) -> CmdResult<MyType> {
       info!("my_command: {}", param);
       let mut unifi = state.unifi.lock().await;
       unifi.do_something(&param).await.map_err(err)
   }
   // Register in invoke_handler: tauri::generate_handler![my_command, ...]
   ```

3. **API wrapper** (`src/lib/api.ts`): Type-safe invoke wrapper
   ```typescript
   export async function myCommand(param: string): Promise<MyType> {
     return invoke<MyType>('my_command', { param });
   }
   ```

4. **Svelte component**: Call the API
   ```svelte
   <script lang="ts">
     import { myCommand } from '../api';
     async function handleClick() {
       const result = await myCommand('value');
     }
   </script>
   ```

### 2. Tauri Command Error Handling

All commands return `CmdResult<T>` which is `Result<T, String>`:

```rust
type CmdResult<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    error!("{}", e);
    e.to_string()
}

// Usage:
some_operation().await.map_err(err)
```

On the frontend, `invoke()` throws a `string` error that can be caught:
```typescript
try {
  const result = await myCommand(param);
} catch (e) {
  console.error('Command failed:', e);
}
```

### 3. Shared State (`AppState`)

`AppState` in `src-tauri/src/state.rs` holds:
- `config: AppConfig` — loaded config
- `unifi: Arc<Mutex<UnifiClient>>` — singleton client (preserves auth session)
- `port_mapping_cache: Arc<Mutex<Option<PortMappingCache>>>` — 60s TTL cache

The `UnifiClient` uses `Arc<Mutex<>>` because the HTTP session (cookie) must be shared across concurrent commands.

### 4. UniFi Auth Retry Pattern

All `UnifiClient` methods use a 2-attempt retry loop (never recursive async):

```rust
pub async fn some_method(&mut self) -> Result<SomeType> {
    for attempt in 0u8..2 {
        self.ensure_logged_in().await?;
        let url = self.api_path("/api/s/.../endpoint");
        let resp = self.http.get(&url)
            .header("Cookie", self.set_cookie_header())
            .send().await?;

        let status = resp.status().as_u16();
        if (status == 401 || status == 403) && attempt == 0 {
            self.cookie = None;
            continue; // retry with fresh login
        }
        if !resp.status().is_success() {
            bail!("Request failed: HTTP {}", resp.status());
        }
        // process response and return
        return Ok(...);
    }
    bail!("Failed after retry")
}
```

**Important**: Do NOT use `Box::pin(self.method()).await` for retry — async recursion with `&mut self` doesn't compile in Rust. Always use a loop.

### 5. SSH Command Pattern (K8s Nodes)

SSH uses `tokio::process::Command` to invoke system `ssh`/`sshpass`:

```rust
async fn run_ssh(&self, node_ip: &str, command: &str) -> Result<String> {
    let ssh = self.ssh.as_ref().ok_or("SSH not configured")?;
    let port = ssh.port.unwrap_or(22);

    let mut cmd = if let Some(key) = &ssh.private_key {
        let mut c = Command::new("ssh");
        c.args(["-o", "StrictHostKeyChecking=no",
                "-o", "UserKnownHostsFile=/dev/null",
                "-p", &port.to_string(),
                "-i", key,
                &format!("{}@{}", ssh.username, node_ip),
                command]);
        c
    } else if let Some(pass) = &ssh.password {
        let mut c = Command::new("sshpass");
        c.args(["-p", pass, "ssh",
                "-o", "StrictHostKeyChecking=no",
                "-p", &port.to_string(),
                &format!("{}@{}", ssh.username, node_ip),
                command]);
        c
    } else {
        bail!("No SSH auth configured");
    };

    let output = cmd.output().await?;
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}
```

### 6. Adding a New Feature

**Example: new K8s node action**

1. Add method to `src-tauri/src/controllers/k8s.rs`
2. Add `#[tauri::command]` in `src-tauri/src/lib.rs` + register in `generate_handler!`
3. Add typed wrapper in `src/lib/api.ts`
4. Add button/handler to `src/lib/components/K8sNodes.svelte`

**Example: new tab**

1. Add a `<button>` in the tab bar in `src/App.svelte`
2. Create `src/lib/components/MyTab.svelte`
3. Import and conditionally render in `App.svelte`

### 7. Configuration Structure

Config is loaded from (in order):
1. `$CONFIG_PATH` env var
2. `../../../config.json` relative to the binary (dev mode)
3. `$XDG_DATA_HOME/homelab-dashboard/config.json`

```json
{
  "unifi": {
    "host": "192.168.1.1",
    "port": 8443,
    "username": "admin",
    "password": "...",
    "site": "default"
  },
  "kubernetes": {
    "cluster": "https://...:6443",
    "token": "...",
    "skipTLSVerify": true,
    "ssh": {
      "username": "ubuntu",
      "password": "...",
      "port": 22
    }
  },
  "healthChecks": [
    { "name": "My Service", "url": "http://...", "expectedStatus": 200 }
  ]
}
```

### 8. Logging

Use `tracing` macros throughout Rust code:

```rust
use tracing::{info, warn, error};

info!("Operation started with param={}", param);
warn!("Unexpected condition");
error!("Failed: {}", e);
```

Logs go to stdout and the platform log directory via `tauri-plugin-log`.

### 9. Mock Mode

All Tauri commands check `mock_mode()` (defined in `lib.rs`) before hitting real backends. This lets the UI run without any config file or network access.

Activate with either env var:
```bash
MOCK=1 npm run tauri dev
# or
MOCK_MODE=1 npm run tauri dev
```

Mock data lives in `src-tauri/src/mock.rs`. When adding new commands, always add a mock branch:
```rust
#[tauri::command]
async fn my_command(state: State<'_, AppState>) -> CmdResult<MyType> {
    if mock_mode() { return Ok(mock::my_data()); }
    // real implementation
}
```

Use the npm script to activate mock mode:
```bash
npm run tauri:mock
```

## Performance Considerations

This app runs on Raspberry Pi 4, so:

- Avoid heavy JavaScript frameworks (React, Vue, etc.) — Svelte compiles away
- Minimize re-renders by using Svelte's reactive stores/statements sparingly
- Use CSS for animations when possible
- Keep bundle size small — check `dist/` after `npm run build`
- The Rust backend is compiled natively for aarch64 — no JS overhead for HTTP/SSH

### GPU / WebKit Rendering on Pi 4

The Pi 4's VideoCore VI GPU causes WebKit rendering corruption (scan lines, glitching) when GPU compositing is enabled. `main.rs` sets these env vars before starting the app:

```rust
std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
```

**Do not remove these** — they must be set before `tauri::Builder` runs, which is why they live in `main.rs` rather than a shell wrapper.

## Common Tauri Command Namespaces

- `unifi_*` — UniFi Controller operations
- `k8s_*` — Kubernetes operations
- `status_*` — Health checks and system status
- `app_*` — Application lifecycle (exit, version)

## Deployment

The app targets Raspberry Pi 4 (aarch64):
- See `DEPLOYMENT.md` for full deployment instructions
- Use `build-rpi.sh` for ARM64 cross-compilation
- Use `deploy-rpi.sh` for remote deployment via SSH (`console` host alias)
- Config file: place `config.json` in the project root for dev, or `/etc/homelab-dashboard/config.json` on the device
- Releases: run `./bump-version.sh patch` to tag; GitHub Actions builds and publishes signed AppImage automatically
