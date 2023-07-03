import * as electron from "electron";
import path from "path";
import url from "url";
import * as inifiClient from "unifi-client"

const { Controller } = inifiClient;

// works with local account, check examples for 2FA
const controller = new Controller({
  username: "console",
  password: "Z3Q0B0gMYGDsWmrwLi07tZ2CkokGhDe8EEChEGkdDZxQef4Ra2",
  url: "https://unifi",
  strictSSL: false
});

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { app, BrowserWindow, ipcMain } = electron;

app.whenReady().then(() => {
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("upgrade", async (event, mac) => {
  await upgradeDevice("default", mac);
  const devices = await getDevices("default");
  event.sender.send("devices", devices);
});

ipcMain.handle("reboot", async (event, mac) => {
  await rebootDevice("default", mac);
  const devices = await getDevices("default");
  event.sender.send("devices", devices);
});

const createWindow = () => {
  const win = new BrowserWindow({
    fullscreen: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, "preload.cjs"),
    }
  });

  if (app.isPackaged) {
    win.loadFile("ui/index.html");
  } else {
    win.loadURL("http://127.0.0.1:5173");
    win.webContents.openDevTools();
  }

  // poll(async () => {
  //   const stats = await getStats("default");
  //   await win.webContents.send("stats", stats);
  // });

  poll(async () => {
    const devices = await getDevices("default");
    await win.webContents.send("devices", devices);
  }, app.isPackaged ? undefined : 1000);
};

function poll(handler, interval = 5000) {
  handler().then(() => {
    setTimeout(() => {
      handler();
      poll(handler, interval);
    }, interval);
  }).catch((error) => {
    console.error(error);
    setTimeout(() => {
      handler();
      poll(handler, interval);
    }, interval);
  });
}

async function getStats(site) {
  await controller.login();
  const { data: { data } } = await controller.getInstance()
    .get(`/proxy/network/api/s/${site}/stat/health`);
  return data;
}

async function getDevices(site) {
  await controller.login();
  const { data: { data } } = await controller.getInstance()
    .get(`/proxy/network/api/s/${site}/stat/device`);
  return data;
}

async function upgradeDevice(site, mac) {
  await controller.login();
  const { data: { data } } = await controller.getInstance()
    .post(`/proxy/network/api/s/${site}/cmd/devmgr`, {
      cmd: "upgrade",
      mac
    });
  return data;
}

async function rebootDevice(site, mac, type = "soft") {
  await controller.login();
  const { data: { data } } = await controller.getInstance()
    .post(`/proxy/network/api/s/${site}/cmd/devmgr`, {
      cmd: "restart",
      mac,
      reboot_type: type
    });
  return data;
}