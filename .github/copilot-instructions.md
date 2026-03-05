# Homelab Dashboard - Copilot Instructions

Keep an eye out for opportunities to update this file with helpful architectural documentation, coding patterns, and best practices for the project. This file should serve as a comprehensive guide for current and future contributors to understand the structure and conventions of the codebase.

Be careful not to create extraneous readme files when making changes. Keep documentation concise and try to keep it in the main readme, only creating new readmes when you have a strong reason to create separate documentation.

Make sure to add secret files to the .gitignore and never include sensitive information in the repository. Use environment variables or secure vaults for managing secrets.

## Project Architecture

This is an Electron-based dashboard application for managing a homelab environment with UniFi network devices and Kubernetes clusters.

### Tech Stack
- **Framework**: Electron (Node.js + Chromium)
- **Language**: TypeScript
- **Target Platform**: Raspberry Pi 3 (ARM architecture)
- **UI**: Vanilla HTML/CSS/JavaScript (no frameworks for performance)

### Project Structure

```
src/
├── main.ts           # Electron main process (IPC handlers, app lifecycle)
├── preload.ts        # Electron preload script (contextBridge API)
├── renderer.ts       # Frontend logic (UI interactions, API calls)
├── types.ts          # TypeScript type definitions (including ElectronAPI)
├── controllers/      # Backend controllers for external services
│   ├── k8s.ts           # Kubernetes API client
│   ├── unifi.ts         # UniFi Controller client
│   ├── status.ts        # Health check controller
│   ├── port-mapper.ts   # Node-to-switch port mapping
│   └── mock/            # Mock implementations for TEST_MODE
├── fixtures/         # Static test data
└── utils/
    └── logger.ts     # Application logging
```

## Key Architectural Patterns

### 1. IPC Communication Flow (Electron)

When adding new functionality that requires backend operations:

**Flow**: Renderer → Preload → Main Process → Controller

1. **Controller** (`src/controllers/*.ts`): Implement the business logic
   ```typescript
   async doSomething(param: string): Promise<Result> {
     // Implementation here
   }
   ```

2. **Main Process** (`src/main.ts`): Add IPC handler
   ```typescript
   ipcMain.handle('namespace:action', async (_, param: string) => {
     try {
       logger.info('IPC: namespace:action called', { param });
       if (TEST_MODE) {
         // Use mock controller
       }
       const controller = new Controller(config.section);
       return await controller.doSomething(param);
     } catch (error) {
       logger.error('IPC: namespace:action failed', error);
       throw error;
     }
   });
   ```

3. **Preload** (`src/preload.ts`): Expose to renderer via contextBridge
   ```typescript
   contextBridge.exposeInMainWorld('electronAPI', {
     namespace: {
       doSomething: (param: string) => ipcRenderer.invoke('namespace:action', param),
     },
   });
   ```

4. **Types** (`src/types.ts`): Add TypeScript interface
   ```typescript
   export interface ElectronAPI {
     namespace: {
       doSomething: (param: string) => Promise<Result>;
     };
   }
   ```

5. **Renderer** (`src/renderer.ts`): Call from UI
   ```typescript
   async function handleAction(param: string) {
     try {
       const result = await window.electronAPI.namespace.doSomething(param);
       alert('Success!');
     } catch (error) {
       alert(`Error: ${(error as Error).message}`);
     }
   }
   ```

### 2. SSH Command Pattern (K8s Nodes)

For operations requiring SSH access to Kubernetes nodes:

- SSH config is stored in `config.json` under `kubernetes.ssh`
- Supports both key-based (`privateKey`) and password-based (`password`) authentication
- Always use `StrictHostKeyChecking=no` for automation
- Node IP addresses are retrieved via `getNodes()` method first
- Example pattern in `K8sController.rebootNode()` and `K8sController.shutdownNode()`

**Template for SSH commands:**
```typescript
async sshCommand(nodeName: string): Promise<void> {
  // 1. Get node IP
  const nodes = await this.getNodes();
  const node = nodes.find(n => n.name === nodeName);
  
  if (!node || !node.ip) {
    throw new Error(`Node ${nodeName} not found or has no IP address`);
  }

  // 2. Check SSH config
  if (!this.sshConfig) {
    throw new Error('SSH configuration not found in kubernetes config');
  }

  const sshPort = this.sshConfig.port || 22;
  const sshUser = this.sshConfig.username;
  
  // 3. Build command based on auth method
  let sshCommand = '';
  
  if (this.sshConfig.privateKey) {
    sshCommand = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${sshPort} -i "${this.sshConfig.privateKey}" ${sshUser}@${node.ip} "your-command-here"`;
  } else if (this.sshConfig.password) {
    sshCommand = `sshpass -p "${this.sshConfig.password}" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${sshPort} ${sshUser}@${node.ip} "your-command-here"`;
  } else {
    throw new Error('No SSH authentication method configured');
  }

  // 4. Execute
  await execAsync(sshCommand);
}
```

### 3. UI Action Buttons (Node/Device Cards)

Node and device cards use inline `onclick` handlers with global functions:

**HTML Generation** (in `renderer.ts`):
```typescript
container.innerHTML = items.map(item => `
  <div class="node-card">
    <div class="node-actions">
      <button class="btn btn-primary" onclick="doAction('${item.id}')">
        Action
      </button>
    </div>
  </div>
`).join('');
```

**Function Definition** (global scope in `renderer.ts`):
```typescript
async function doAction(id: string) {
  if (!confirm('Are you sure?')) return;
  
  try {
    await window.electronAPI.namespace.doAction(id);
    alert('Success!');
    reloadData(); // Refresh the view
  } catch (error) {
    alert(`Error: ${(error as Error).message}`);
  }
}
```

**Button Classes**:
- `btn-primary`: Blue (default action)
- `btn-success`: Green (safe/positive action)
- `btn-info`: Cyan (informational action)
- `btn-warning`: Orange (caution action)
- `btn-danger`: Red (destructive action)
- `btn-secondary`: Gray (neutral action)

### 4. Mock Controllers (Testing)

When adding new controller methods:

1. Implement in main controller (`src/controllers/*.ts`)
2. Add mock implementation in `src/controllers/mock/*-mock.ts`
3. Return realistic test data that matches the interface
4. The main process checks `TEST_MODE` environment variable

Example:
```typescript
// In K8sControllerMock
async newMethod(param: string): Promise<Result> {
  return {
    // Mock data matching the Result interface
  };
}
```

### 5. Configuration Structure

Configuration is loaded from `config.json` in the main process:

```json
{
  "unifi": {
    "host": "...",
    "port": 8443,
    "username": "...",
    "password": "...",
    "site": "default"
  },
  "kubernetes": {
    "cluster": "https://...:6443",
    "token": "...",
    "skipTLSVerify": true,
    "ssh": {
      "username": "...",
      "password": "...",  // OR privateKey
      "port": 22
    }
  },
  "status": {
    "healthChecks": [...]
  }
}
```

### 6. Error Handling

**Backend (Controllers/Main)**:
- Use try-catch blocks
- Log errors with `logger.error()`
- Throw descriptive Error objects
- IPC handlers should re-throw to send to renderer

**Frontend (Renderer)**:
- Use try-catch around API calls
- Show user-friendly alerts with error messages
- Consider reloading data after operations

### 7. Logging

Use the logger utility throughout:

```typescript
import logger from '../utils/logger';

logger.info('Operation started', { param1, param2 });
logger.warn('Warning condition');
logger.error('Error occurred', error);
```

Logs are written to `logs/` directory for debugging.

## Adding New Features

### Example: Adding a new node operation

1. Add method to `K8sController` (follow SSH pattern if needed)
2. Add IPC handler in `main.ts` under `k8s:` namespace
3. Add mock implementation in `K8sControllerMock`
4. Expose in `preload.ts` under `k8s` object
5. Add TypeScript type in `types.ts` ElectronAPI interface
6. Add button to node card HTML in `renderer.ts`
7. Add handler function in `renderer.ts`
8. Test with `TEST_MODE=true` first

### Example: Adding a new tab

1. Add HTML structure in `index.html`
2. Add tab button with `data-tab` attribute
3. Add content div with matching ID
4. Add load function in `renderer.ts`
5. Add refresh button handler
6. Call load function in `DOMContentLoaded`

## Performance Considerations

This app runs on Raspberry Pi 3, so:

- Avoid heavy JavaScript frameworks (React, Vue, etc.)
- Use vanilla DOM manipulation
- Minimize re-renders
- Use CSS for animations when possible
- Keep bundle size small
- Disable GPU acceleration (done in main.ts)

## Common Namespaces

- `unifi:` - UniFi Controller operations
- `k8s:` - Kubernetes operations
- `status:` - Health checks and system status
- `app:` - Application lifecycle (exit, etc.)

## Deployment

The app is designed to be deployed on Raspberry Pi 3:
- See `DEPLOYMENT.md` for deployment instructions
- See `QUICKSTART.md` for local development setup
- Use `build-rpi.sh` for ARM builds
- Use `deploy-rpi.sh` for remote deployment
