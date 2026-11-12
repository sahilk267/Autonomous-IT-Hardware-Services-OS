const path = require('node:path');
const { validateHostedOrigin } = require('./hosted.cjs');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIMPLE_KEYS = ['geminiApiKey', 'telegramBotToken', 'telegramWebhookSecret',
  'telegramAuthorizedUserId', 'telegramAuthorizedChatId', 'razorpayKeyId',
  'razorpayKeySecret', 'gstApiKey', 'm365TenantId', 'm365ClientId',
  'm365ClientSecret'];

function validOptional(value, key) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 4096 || /[\r\n\0]/.test(value)) {
    throw new Error(`Invalid ${key}: expected a single-line value`);
  }
  return value.trim();
}

function validateDesktopSettings(raw, defaultDataDirectory) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid desktop configuration');
  if (process.platform !== 'win32' && process.env.NODE_ENV === 'production' && !process.env.APEX_DESKTOP_TEST) {
    throw new Error('Packaged desktop configuration is supported only on Windows');
  }
  const mode = ['hosted', 'single', 'postgres'].includes(raw.storageMode) ? raw.storageMode : null;
  if (!mode) throw new Error('Choose Hosted, Local JSON or Local PostgreSQL mode');
  let directory = typeof raw.dataDirectory === 'string' && raw.dataDirectory.trim()
    ? path.resolve(raw.dataDirectory.trim()) : path.resolve(defaultDataDirectory);
  if (!path.isAbsolute(directory) || directory.length > 1024) throw new Error('Data directory must be a local absolute path');

  const configuration = {
    storageMode: mode,
    dataDirectory: directory,
    databaseUrl: '',
    tenantMode: 'fixed',
    tenantId: '',
    serverUrl: '',
    connectionPending: true,
  };
  if (mode === 'hosted') {
    // It is legitimate to install the client before the server is deployed.
    // An empty origin stays in pending-configuration mode until entered later.
    configuration.serverUrl = raw.serverUrl?.trim()
      ? validateHostedOrigin(raw.serverUrl.trim()) : '';
    // Persist the deferred choice. Otherwise a saved but not-yet-verified URL
    // would be auto-opened at the next launch without the user's consent.
    configuration.connectionPending = !configuration.serverUrl || raw.connectionPending !== false;
    return Object.freeze(configuration); // NEVER persist local DB or integration secrets in a remote client.
  }
  if (mode === 'postgres') {
    const url = validOptional(raw.databaseUrl, 'PostgreSQL connection');
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('PostgreSQL connection URL is invalid'); }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname ||
        !parsed.username || !parsed.password || !parsed.pathname || parsed.pathname === '/') {
      throw new Error('PostgreSQL URL must include host, username, password and database');
    }
    if (parsed.searchParams.has('sslmode') && parsed.searchParams.get('sslmode') === 'disable') {
      throw new Error('PostgreSQL sslmode=disable cannot be saved in the desktop wizard');
    }
    configuration.databaseUrl = url;
    if (!['fixed', 'dynamic'].includes(raw.tenantMode)) throw new Error('Choose fixed or dynamic PostgreSQL workspace mode');
    configuration.tenantMode = raw.tenantMode;
    if (configuration.tenantMode === 'fixed') {
      if (typeof raw.tenantId !== 'string' || !UUID.test(raw.tenantId)) {
        throw new Error('Fixed PostgreSQL workspace requires provisioned tenant UUID');
      }
      configuration.tenantId = raw.tenantId.toLowerCase();
    }
  }
  for (const key of SIMPLE_KEYS) configuration[key] = validOptional(raw[key], key);
  return Object.freeze(configuration);
}

function environmentForDesktop(settings, port, setupToken, distDirectory) {
  if (settings?.storageMode === 'hosted') {
    throw new Error('Hosted desktop clients must never start a local database or backend');
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid desktop local port');
  if (typeof setupToken !== 'string' || setupToken.length < 32) throw new Error('Missing generated desktop setup token');
  const env = {
    NODE_ENV: 'production',
    APEX_DESKTOP_MODE: '1',
    APEX_BIND_HOST: '127.0.0.1',
    APP_URL: `http://127.0.0.1:${port}`,
    APEX_ALLOWED_ORIGINS: '',
    APEX_SETUP_TOKEN: setupToken,
    APEX_STORAGE_MODE: settings.storageMode,
    APEX_TENANT_MODE: settings.tenantMode,
    APEX_DATA_DIR: settings.dataDirectory,
    APEX_TENANT_ID: settings.tenantId,
    DATABASE_URL: settings.databaseUrl,
    PORT: String(port),
    APEX_DIST_DIR: distDirectory,
    GEMINI_API_KEY: settings.geminiApiKey,
    TELEGRAM_BOT_TOKEN: settings.telegramBotToken,
    TELEGRAM_WEBHOOK_SECRET: settings.telegramWebhookSecret,
    TELEGRAM_AUTHORIZED_USER_ID: settings.telegramAuthorizedUserId,
    TELEGRAM_AUTHORIZED_CHAT_ID: settings.telegramAuthorizedChatId,
    RAZORPAY_KEY_ID: settings.razorpayKeyId,
    RAZORPAY_KEY_SECRET: settings.razorpayKeySecret,
    GST_API_KEY: settings.gstApiKey,
    M365_TENANT_ID: settings.m365TenantId,
    M365_CLIENT_ID: settings.m365ClientId,
    M365_CLIENT_SECRET: settings.m365ClientSecret,
  };
  return env;
}
module.exports = { validateDesktopSettings, environmentForDesktop, SIMPLE_KEYS };
