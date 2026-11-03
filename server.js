/**
 * Hostinger Shared Hosting (Node.js Application Manager) Entry Point
 * 
 * Hostinger's hPanel Node.js manager runs this file to start the Express server.
 * In production, it routes requests through `dist/server.cjs` which bundles
 * all server-side logic, Gemini API endpoints, and serves static files from `dist/`.
 */
const path = require('path');
const fs = require('fs');

const bundlePath = path.join(__dirname, 'dist', 'server.cjs');

if (fs.existsSync(bundlePath)) {
  require(bundlePath);
} else {
  console.error('Error: dist/server.cjs not found. Please run "npm run build" first.');
  process.exit(1);
}
