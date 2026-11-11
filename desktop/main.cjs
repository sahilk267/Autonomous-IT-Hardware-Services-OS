const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { validateDesktopSettings, environmentForDesktop } = require('./config.cjs');

if (!app.requestSingleInstanceLock()) app.quit();

let mainWindow = null;
let setupWindow = null;
let backend = null;
let backendPort = null;
let currentSettings = null;
let settingsToken = null;
let closing = false;

function encryptedFile() { return path.join(app.getPath('userData'), 'settings.dpapi'); }
function defaultDataDirectory() { return path.join(app.getPath('userData'), 'data'); }

function readSettings() {
  if (!fs.existsSync(encryptedFile())) return null;
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable');
  const raw = safeStorage.decryptString(fs.readFileSync(encryptedFile()));
  const data = JSON.parse(raw);
  const config = validateDesktopSettings(data, defaultDataDirectory());
  if (typeof data.setupToken !== 'string' || data.setupToken.length < 32) {
    throw new Error('Encrypted desktop bootstrap configuration is corrupted');
  }
  return { ...config, setupToken: data.setupToken };
}
function writeSettings(settings) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable');
  const target = encryptedFile();
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = target + '.tmp-' + crypto.randomBytes(5).toString('hex');
  try {
    fs.writeFileSync(temporary, safeStorage.encryptString(JSON.stringify(settings)), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}
async function selectPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function restrictNavigation(window, allowed) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, nextUrl) => {
    if (nextUrl !== allowed) event.preventDefault();
  });
  window.webContents.on('will-redirect', (event) => event.preventDefault());
}
function setupFile() { return path.join(__dirname, 'setup.html'); }
function trustedSetup(event) {
  return !!setupWindow && !setupWindow.isDestroyed() && event.sender === setupWindow.webContents &&
    event.senderFrame?.url.startsWith('file://') &&
    decodeURI(new URL(event.senderFrame.url).pathname).endsWith('/desktop/setup.html');
}
function trustedApp(event) {
  return !!mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents &&
    event.senderFrame?.url.startsWith(`http://127.0.0.1:${backendPort}/`);
}
function setupDialog() {
  if (setupWindow && !setupWindow.isDestroyed()) { setupWindow.focus(); return; }
  setupWindow = new BrowserWindow({
    width: 740, height: 720, minWidth: 560, minHeight: 590,
    title: 'Apex IT OS — Secure Desktop Configuration',
    backgroundColor: '#0b1120', autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  setupWindow.loadFile(setupFile());
  setupWindow.on('closed', () => {
    setupWindow = null;
    if (!backend && !closing) app.quit();
  });
  restrictNavigation(setupWindow, 'file://' + setupFile().replace(/\\/g, '/'));
}
function mainAppWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    void mainWindow.loadURL(`http://127.0.0.1:${backendPort}/`);
    mainWindow.show();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 980, minHeight: 700,
    title: 'Apex IT Hardware & Services OS',
    backgroundColor: '#020617', autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  const appUrl = `http://127.0.0.1:${backendPort}/`;
  void mainWindow.loadURL(appUrl);
  restrictNavigation(mainWindow, appUrl);
  mainWindow.on('closed', () => mainWindow = null);
}
async function stopBackend() {
  const old = backend;
  backend = null;
  if (!old || old.exitCode !== null) return;
  old.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => old.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 3500)),
  ]);
  if (old.exitCode === null) old.kill();
}
async function startBackend(settings) {
  const port = await selectPort();
  const runtimeEnv = environmentForDesktop(settings, port, settings.setupToken,
    path.join(process.resourcesPath, 'web'));
  // EAGER preload never exposes DATABASE_URL to browser; only the Node child
  // receives the protected runtime configuration.
  const executable = path.join(app.getAppPath(), 'dist', 'server.cjs');
  const child = spawn(process.execPath, [executable], {
    cwd: app.getPath('userData'),
    env: { ...process.env, ...runtimeEnv, ELECTRON_RUN_AS_NODE: '1' },
    windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.on('data', chunk => console.error('[Apex backend]', String(chunk).slice(0, 2000)));
  backend = child;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(800),
      });
      const data = await response.json();
      if (response.ok && data.status === 'ok' && data.database?.status === 'ready') {
        backendPort = port;
        return;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  await stopBackend();
  throw new Error('Backend could not pass its local startup and database health checks.');
}

app.on('second-instance', () => {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : setupWindow;
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(async () => {
  if (process.platform !== 'win32' || !safeStorage.isEncryptionAvailable()) {
    console.error('Apex desktop requires Windows with secure credential encryption');
    app.quit(); return;
  }
  ipcMain.handle('desktop:setup-config', (event) => {
    if (!trustedSetup(event)) throw new Error('Unauthorized configuration access');
    const config = currentSettings || readSettings();
    if (!config) return { storageMode: 'single', tenantMode: 'fixed', dataDirectory: defaultDataDirectory() };
    const { setupToken, ...visibleConfig } = config;
    return visibleConfig;
  });
  ipcMain.handle('desktop:choose-directory', async event => {
    if (!trustedSetup(event)) throw new Error('Unauthorized directory selection');
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(setupWindow, {
      title: 'Choose private data directory', properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('desktop:save-config', async (event, submitted) => {
    if (!trustedSetup(event)) throw new Error('Unauthorized configuration change');
    try {
      const next = validateDesktopSettings(submitted, defaultDataDirectory());
      const prior = currentSettings || readSettings();
      if (prior?.storageMode === 'single' && prior.dataDirectory !== next.dataDirectory) {
        throw new Error('Data directory cannot be changed in-place. Back up and migrate data first.');
      }
      const token = prior?.setupToken || crypto.randomBytes(32).toString('hex');
      const config = { ...next, setupToken: token };
      const oldPort = backendPort;
      if (backend) await stopBackend();
      try {
        await startBackend(config);
        writeSettings(config);
        currentSettings = config;
      } catch (err) {
        if (prior) {
          try { await startBackend(prior); backendPort = backendPort || oldPort; } catch {}
        }
        throw err;
      }
      if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
      mainAppWindow();
      return { ok: true };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle('desktop:get-setup-token', async (event, workspaceId) => {
    if (!trustedApp(event) || !currentSettings) return null;
    try {
      const suffix = workspaceId ? '?workspaceId=' + encodeURIComponent(workspaceId) : '';
      const response = await fetch(`http://127.0.0.1:${backendPort}/api/auth/status${suffix}`, {
        signal: AbortSignal.timeout(2500),
      });
      const data = await response.json();
      return response.ok && data.needsSetup === true ? currentSettings.setupToken : null;
    } catch { return null; }
  });
  ipcMain.handle('desktop:open-settings', event => {
    if (!trustedApp(event)) throw new Error('Unauthorized desktop settings request');
    setupDialog();
  });

  try {
    currentSettings = readSettings();
    if (currentSettings) { await startBackend(currentSettings); mainAppWindow(); }
    else setupDialog();
  } catch (error) {
    console.error('Desktop backend startup failed:', error.message);
    setupDialog();
  }
});
app.on('before-quit', () => { closing = true; void stopBackend(); });
app.on('window-all-closed', () => app.quit());
