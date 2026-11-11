import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateDesktopSettings, environmentForDesktop } = require('../desktop/config.cjs');

const uuid = '6f08aaff-c84f-46e2-99f6-0bbe82c874f1';
const dataDir = process.platform === 'win32' ? 'C:\\Users\\Apex\\data' : '/tmp/apex-desktop-data';
test('local desktop wizard supplies private default path and loopback only', () => {
  const settings = validateDesktopSettings({ storageMode: 'single' }, dataDir);
  const env = environmentForDesktop(settings, 32190, 'x'.repeat(64), '/app/web');
  assert.equal(env.APEX_DATA_DIR, dataDir);
  assert.equal(env.APP_URL, 'http://127.0.0.1:32190');
  assert.equal(env.APEX_BIND_HOST, '127.0.0.1');
  assert.equal(env.APEX_ALLOWED_ORIGINS, '');
  assert.equal(env.APEX_STORAGE_MODE, 'single');
  assert.equal(env.APEX_DESKTOP_MODE, '1');
});
test('postgres wizard rejects admin-owner bypass and malformed scope inputs', () => {
  for (const input of [
    { storageMode: 'postgres', databaseUrl: '' },
    { storageMode: 'postgres', databaseUrl: 'https://user:pw@host/db' },
    { storageMode: 'postgres', databaseUrl: 'postgresql://root:password@db.local/apex?sslmode=disable' },
    { storageMode: 'postgres', databaseUrl: 'postgresql://user:pass@db.local/apex', tenantMode: 'fixed', tenantId: 'foreign-id' },
    { storageMode: 'postgres', databaseUrl: 'postgresql://user:pass@db.local/apex', tenantMode: 'unrestricted' },
  ]) assert.throws(() => validateDesktopSettings(input, dataDir), /PostgreSQL|tenant|workspace|connection|URL|mode/i);
});
test('dynamic workspace selection does not accept default tenant ID', () => {
  const config = validateDesktopSettings({
    storageMode: 'postgres', tenantMode: 'dynamic', tenantId: uuid,
    databaseUrl: 'postgresql://runtime:private@db.local:5432/apex?sslmode=require',
    geminiApiKey: 'secret-key', telegramBotToken: 'telegram-test',
  }, dataDir);
  assert.equal(config.tenantId, '');
  const env = environmentForDesktop(config, 35670, 'token'.repeat(10), '/app/web');
  assert.equal(env.APEX_TENANT_MODE, 'dynamic');
  assert.equal(env.APEX_TENANT_ID, '');
  assert.equal(env.GEMINI_API_KEY, 'secret-key');
  assert.equal(env.TELEGRAM_BOT_TOKEN, 'telegram-test');
});
test('desktop wizard rejects newline injection and missing bootstrap token', () => {
  assert.throws(() => validateDesktopSettings({
    storageMode: 'single', telegramBotToken: 'bot\nX=bad',
  }, dataDir), /Invalid telegramBotToken/);
  const s = validateDesktopSettings({ storageMode: 'single' }, dataDir);
  assert.throws(() => environmentForDesktop(s, 123, 'tiny', '/app/web'), /port|token/i);
  assert.throws(() => environmentForDesktop(s, 3000, 'tiny', '/app/web'), /token/);
});
