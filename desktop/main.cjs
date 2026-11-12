const { app, BrowserWindow, ipcMain, safeStorage, Menu, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { validateDesktopSettings, environmentForDesktop } = require('./config.cjs');
const { probeHostedServer, isPermittedNavigation } = require('./hosted.cjs');

if (!app.requestSingleInstanceLock()) app.quit();

let mainWindow = null;
let setupWindow = null;
let backend = null;
let backendPort = null;
let currentSettings = null;
let connectionError = null;
let connectionChangeInProgress = false;
let windowKind = null;
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
function hostedPartition(origin) {
  return 'persist:apex-hosted-' + crypto.createHash('sha256').update(origin).digest('hex').slice(0, 24);
}

function createNativeMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Server', submenu: [
      { label: 'Configure / Change Server...', click: () => setupDialog() },
      { label: 'Retry Connection', click: () => {
        if (currentSettings?.storageMode === 'hosted' && currentSettings.serverUrl) {
          void connectHosted(currentSettings).catch(error => {
            connectionError = error.message;
            setupDialog();
          });
        }
      }},
      { label: 'Forget Hosted Login on This PC', click: () => {
        if (currentSettings?.storageMode === 'hosted' && currentSettings.serverUrl) {
          void session.fromPartition(hostedPartition(currentSettings.serverUrl))
            .clearStorageData().then(() => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                void mainWindow.loadURL(currentSettings.serverUrl + '/');
              }
            });
        }
      }},
      { type: 'separator' },
      { role: 'quit' },
    ] },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }] },
  ]));
}

function restrictNavigation(window, allowed) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, nextUrl) => {
    if (nextUrl !== allowed()) event.preventDefault();
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
  void setupWindow.loadFile(setupFile());
  setupWindow.on('closed', () => {
    setupWindow = null;
    if (!backend && !mainWindow && !closing) app.quit();
  });
  restrictNavigation(setupWindow, () => pathToFileURL(setupFile()).href);
}
function mainAppWindow() {
  if (currentSettings?.storageMode === 'hosted') return hostedAppWindow(currentSettings.serverUrl);
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (windowKind === 'local') {
      void mainWindow.loadURL(`http://127.0.0.1:${backendPort}/`);
      mainWindow.show();
      return;
    }
    mainWindow.close();
    mainWindow = null;
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
  windowKind = 'local';
  const appUrl = `http://127.0.0.1:${backendPort}/`;
  void mainWindow.loadURL(appUrl);
  restrictNavigation(mainWindow, () => `http://127.0.0.1:${backendPort}/`);
  const localWindow = mainWindow;
  localWindow.on('closed', () => {
    if (mainWindow === localWindow) mainWindow = null;
  });
}
/**
 * Hosted mode does not launch the bundled Node server or access DATABASE_URL.
 * The remote web app is opened in an unprivileged Chromium sandbox WITHOUT
 * a preload bridge, with a distinct cookie/storage partition for each origin.
 * Connection settings are managed by the native menu and local setup window.
 */
function hostedAppWindow(origin) {
  if (!origin) { setupDialog(); return; }
  const old = mainWindow;
  const partition = hostedPartition(origin);
  const remoteSession = session.fromPartition(partition);
  remoteSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  remoteSession.setPermissionCheckHandler(() => false);
  const window = new BrowserWindow({
    width: 1440, height: 920, minWidth: 980, minHeight: 700,
    title: 'Apex IT OS — ' + origin,
    backgroundColor: '#020617', autoHideMenuBar: false,
    webPreferences: {
      partition, nodeIntegration: false, contextIsolation: true,
      sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
      // IMPORTANT: no preload. A hosted webpage must never see
      // desktop settings, DPAPI, filesystem, IPC or the local setup token.
    },
  });
  const wc = window.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (event, target) => {
    if (!isPermittedNavigation(target, origin)) event.preventDefault();
  });
  wc.on('will-redirect', (event, target) => {
    if (!isPermittedNavigation(target, origin)) event.preventDefault();
  });
  wc.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) {
      connectionError = 'Hosted app could not load (' + code + '). Verify server/HTTPS and retry.';
      console.error('Hosted page load failed:', description, url);
      setupDialog();
    }
  });
  mainWindow = window;
  windowKind = 'hosted';
  void window.loadURL(origin + '/').catch(error => {
    connectionError = error.message;
    setupDialog();
  });
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; });
  if (old && !old.isDestroyed()) old.close();
  window.show();
}

async function connectHosted(settings) {
  if (!settings.serverUrl) {
    connectionError = 'Server not deployed yet. Enter its HTTPS address after deployment.';
    setupDialog();
    return null;
  }
  const verified = await probeHostedServer(settings.serverUrl);
  connectionError = null;
  hostedAppWindow(verified.origin);
  return verified;
}

// Only a dead LOCAL PID's own recorded lock may be reclaimed. Another
// running service, symlink or unknown host always fails closed.
function cleanupDeadDesktopLock(directory, expectedPid = null) {
  const lockPath = path.join(directory, 'app-store.json.lock');
  try {
    const stat = fs.lstatSync(lockPath);
    if (!stat.isFile() || stat.isSymbolicLink()) return;
    const original = fs.readFileSync(lockPath, 'utf8');
    const lock = JSON.parse(original);
    if (!Number.isInteger(lock.pid) || lock.pid <= 1 || lock.host !== os.hostname() ||
        (expectedPid !== null && expectedPid !== lock.pid)) return;
    try { process.kill(lock.pid, 0); return; } catch (error) {
      if (error.code !== 'ESRCH') return; // EPERM is a live/unknown writer.
    }
    if (fs.readFileSync(lockPath, 'utf8') === original) fs.unlinkSync(lockPath);
  } catch {
    // Unknown lock owner: preserve lock; backend must fail startup.
  }
}
async function stopBackend(oldSettings = currentSettings) {
  const old = backend;
  backend = null;
  if (!old) return;
  if (old.exitCode === null && old.signalCode === null) {
    old.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => old.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 3500)),
    ]);
    if (old.exitCode === null && old.signalCode === null) old.kill();
  }
  if (oldSettings?.storageMode === 'single') {
    cleanupDeadDesktopLock(oldSettings.dataDirectory, old.pid);
  }
}
async function startBackend(settings) {
  if (settings.storageMode === 'single') cleanupDeadDesktopLock(settings.dataDirectory);
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
    if (child.exitCode !== null || child.signalCode !== null) break;
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
  createNativeMenu();
  if (process.platform !== 'win32' || !safeStorage.isEncryptionAvailable()) {
    console.error('Apex desktop requires Windows with secure credential encryption');
    app.quit(); return;
  }
  ipcMain.handle('desktop:setup-config', (event) => {
    if (!trustedSetup(event)) throw new Error('Unauthorized configuration access');
    const config = currentSettings || readSettings();
    if (!config) return {
      storageMode: 'hosted', serverUrl: '', tenantMode: 'fixed',
      dataDirectory: defaultDataDirectory(), connectionError,
    };
    const { setupToken, ...visibleConfig } = config;
    return { ...visibleConfig, connectionError };
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
    if (connectionChangeInProgress) return { ok: false, error: 'A connection change is already running.' };
    connectionChangeInProgress = true;
    let prior = currentSettings;
    try {
      const next = validateDesktopSettings(submitted, defaultDataDirectory());
      prior = prior || readSettings();
      if (prior?.storageMode === 'single' && next.storageMode === 'single' &&
          prior.dataDirectory !== next.dataDirectory) {
        throw new Error('Local data folder cannot be changed in place. Back up and migrate first.');
      }
      const previousRemote = prior?.storageMode === 'hosted' ? prior.serverUrl : null;
      const changedServer = previousRemote && previousRemote !== next.serverUrl;
      const changedMode = prior && prior.storageMode !== next.storageMode;
      if ((changedServer || changedMode) && submitted.confirmServerChange !== 'on') {
        throw new Error('Confirm that switching servers/modes does NOT migrate data or active sessions.');
      }
      const token = prior?.setupToken || crypto.randomBytes(32).toString('hex');
      const config = { ...next, setupToken: token };

      if (config.storageMode === 'hosted') {
        const pending = !config.serverUrl || submitted.deferConnection === 'on';
        if (!pending) {
          // HTTPS check is performed BEFORE saving or shutting down an existing
          // working server. A typo, stale TLS cert, redirect, or wrong product
          // does not overwrite a previously working connection.
          await probeHostedServer(config.serverUrl);
        }
        writeSettings(config);
        currentSettings = config;
        if (backend) await stopBackend(prior);
        if (previousRemote && previousRemote !== config.serverUrl) {
          // Old cookies, indexed DB and service workers cannot be reused
          // after switching to another hosted organization/server.
          await session.fromPartition(hostedPartition(previousRemote)).clearStorageData();
        }
        if (pending) {
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
          connectionError = config.serverUrl
            ? 'Server URL saved but NOT verified. Uncheck Save for later to test after deployment.'
            : 'Installer is configured. Enter your server HTTPS URL when the server has been deployed.';
          return { ok: true, pending: true, message: connectionError };
        }
        connectionError = null;
        hostedAppWindow(config.serverUrl);
        if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
        return { ok: true, mode: 'hosted', origin: config.serverUrl };
      }

      // Local modes are independent of hosted mode. Only the private local
      // backend receives DATABASE_URL, integration keys and bootstrap token.
      if (backend) await stopBackend(prior);
      try {
        await startBackend(config);
        writeSettings(config);
        currentSettings = config;
      } catch (error) {
        await stopBackend(config);
        if (prior && prior.storageMode !== 'hosted') {
          try { await startBackend(prior); currentSettings = prior; } catch {}
        }
        throw error;
      }
      if (previousRemote) {
        await session.fromPartition(hostedPartition(previousRemote)).clearStorageData();
      }
      connectionError = null;
      mainAppWindow();
      if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
      return { ok: true, mode: 'local' };
    } catch (error) {
      connectionError = error.message;
      return { ok: false, error: error.message };
    } finally {
      connectionChangeInProgress = false;
    }
  });
  ipcMain.handle('desktop:get-setup-token', async (event, workspaceId) => {
    if (!trustedApp(event) || !currentSettings) return null;
    try {
      const suffix = workspaceId ? '?workspaceId=' + encodeURIComponent(workspaceId) : '';
      const response = await fetch(`http://127.0.0.1:${backendPort}/api/auth/status${suffix}`, {
        signal: AbortSignal.timeout(2500),
      });
      const data = await response.json();
      if (!response.ok || data.needsSetup !== true) return null;
      if (currentSettings.storageMode === 'postgres' && currentSettings.tenantMode === 'dynamic') {
        if (typeof workspaceId !== 'string' ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId)) return null;
        return crypto.createHmac('sha256', currentSettings.setupToken)
          .update('apex-workspace-enrollment-v1:' + workspaceId.toLowerCase())
          .digest('hex');
      }
      return currentSettings.setupToken;
    } catch { return null; }
  });
  ipcMain.handle('desktop:open-settings', event => {
    if (!trustedApp(event)) throw new Error('Unauthorized desktop settings request');
    setupDialog();
  });

  try {
    currentSettings = readSettings();
    if (!currentSettings) {
      setupDialog();
    } else if (currentSettings.storageMode === 'hosted') {
      if (currentSettings.serverUrl) await connectHosted(currentSettings);
      else {
        connectionError = 'Server is not configured yet. Enter its HTTPS URL after deployment.';
        setupDialog();
      }
    } else {
      await startBackend(currentSettings);
      mainAppWindow();
    }
  } catch (error) {
    connectionError = error.message;
    console.error('Desktop startup failed:', error.message);
    setupDialog();
  }
});
app.on('before-quit', () => { closing = true; void stopBackend(); });
app.on('window-all-closed', () => app.quit());
