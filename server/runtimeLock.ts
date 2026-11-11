import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';

/**
 * Single-host last-resort lock for the legacy JSON store. This is deliberately
 * NOT a distributed lock. Multi-instance deployments must wait for PostgreSQL.
 * SIGKILL / power loss can leave a stale lock: operator must verify that the
 * old process is gone before removing the file.
 */
export function acquireStoreLock(dbFile: string): () => void {
  const lockPath = dbFile + '.lock';
  const nonce = crypto.randomBytes(16).toString('hex');
  const data = JSON.stringify({ pid: process.pid, host: os.hostname(), since: new Date().toISOString(), nonce });
  let fd: number;
  try {
    fd = fs.openSync(lockPath, 'wx', 0o600);
  } catch (error: any) {
    if (error?.code === 'EEXIST') {
      throw new Error(`Another Apex instance may own ${lockPath}. Stop the previous writer and verify the lock is stale before removing it.`);
    }
    throw error;
  }

  try {
    fs.writeFileSync(fd, data, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (lock.nonce === nonce && lock.pid === process.pid) fs.unlinkSync(lockPath);
    } catch {
      // Never delete another process's lock or throw while exiting.
    }
  };
  process.once('exit', release);
  return release;
}
