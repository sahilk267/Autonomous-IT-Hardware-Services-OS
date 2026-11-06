> **CAUTION — HISTORICAL CHECKLIST, NOT CURRENT PRODUCTION SIGN-OFF (2026-11-06).** Many PASS claims below predate the latest audit and refer only to code or mock-free startup, not provider transactions, tenant isolation, endpoint authorizations or live Hostinger deployment. See [current implementation tracker](IMPLEMENTATION_TRACKER.md) and [implementation report](IMPLEMENTATION_REPORT_2026-11-06.md). Actual production readiness remains **BLOCKED**.

# Production Readiness & Hardening Checklist

**Application**: Apex Autonomous IT Hardware & Services Operating System  
**Deployment Profile**: Enterprise Production / Hostinger Shared Hosting / Cloud Run  
**Compliance Level**: Zero Mock Data Invariant Passed

---

## 1. Readiness Verification Matrix

| Category | Item | Status | Verification Detail |
| :--- | :--- | :--- | :--- |
| **Data Integrity** | Zero Mock Records | ✅ PASS | Startup state starts with 0 products, 0 tickets, 0 jobs, 0 invoices. |
| **Data Integrity** | Persistence Mechanism | ✅ PASS | Atomic file writes with `.tmp` staging + `fs.renameSync` + pre-mutation backups. |
| **Integration** | Honest Connectors | ✅ PASS | Unset API keys report `NOT_CONFIGURED` (no simulated connected counts). |
| **Integration** | AI Failover | ✅ PASS | Gemini API calls return explicit HTTP 503 with instructions if key is missing. |
| **Integration** | Payment Gateways | ✅ PASS | Razorpay/UPI endpoints return honest 503 when unconfigured. |
| **Integration** | Indian GST Portal | ✅ PASS | NIC IRN signing returns honest 503 when unconfigured. |
| **Runtime** | Dynamic Port Binding | ✅ PASS | `PORT = Number(process.env.PORT) || 3000` enables compatibility with Hostinger and Cloud Run. |
| **Security** | Secrets Management | ✅ PASS | Zero credentials committed in repository; clean placeholders in `.env.example`. |
| **Build & Bundle** | Static & Server Bundles | ✅ PASS | Vite produces optimized assets; `esbuild` creates single `dist/server.cjs`. |
| **Routing** | SPA History Fallback | ✅ PASS | `public/.htaccess` rewrite rules handle deep links and page refreshes. |
| **Code Quality** | Type Safety | ✅ PASS | 100% TypeScript compliance (`tsc --noEmit` exits with 0 errors). |
| **Automated Tests**| Regression Test Suite | ✅ PASS | `tests/zero_mock_data.test.ts` passes 9/9 assertions via `npm test`. |

---

## 2. Environment Configuration Matrix

Ensure all production environment variables are configured in the host environment or `.env`:

```env
# Server
PORT=3000
NODE_ENV=production
APP_URL=https://your-domain.com

# Core Services
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-2.5-flash

# Optional Integrations
TELEGRAM_BOT_TOKEN=123456789:ABC...
TELEGRAM_WEBHOOK_SECRET=your_random_secret_token
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
GST_API_KEY=...
GST_SELLER_GSTIN=27AAACA1234A1Z5
M365_CLIENT_ID=...
M365_TENANT_ID=...
M365_CLIENT_SECRET=...
```

---

## 3. Hostinger Deployment Quick-Reference

1. Build production artifacts locally:
   ```bash
   npm run build
   ```
2. Upload the following files to Hostinger `public_html/` or application directory:
   - `dist/` (directory)
   - `server.js` (root entrypoint)
   - `package.json`
   - `.env`
3. In Hostinger hPanel > **Node.js**:
   - Set **Node.js version** to `20.x`.
   - Set **Application Startup File** to `server.js`.
   - Set environment variables (`GEMINI_API_KEY`, `NODE_ENV=production`, `PORT`).
   - Run **NPM Install** (`npm install --omit=dev`).
   - Click **Restart / Start Application**.
