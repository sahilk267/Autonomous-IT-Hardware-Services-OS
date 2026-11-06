import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

try {
  require('./dist/server.cjs');
} catch (error) {
  console.error('Unable to start Apex OS:', error);
  process.exitCode = 1;
}
