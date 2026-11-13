# 🚀 Hostinger Business Shared Web Hosting Deployment Guide

> **IMPORTANT — Phase 4 (8 November 2026):** This guide describes candidate deployment steps, **not certified production readiness**. The server now **refuses to start** in `NODE_ENV=production` unless `APEX_DATA_FILE` is an **absolute private path outside the application checkout**. Existing installations using `data/app-store.json` must perform an offline, verified migration BEFORE deploying this PR. No actual Hostinger migration was performed. See [deployment data safety checklist](docs/DEPLOYMENT_DATA_SAFETY.md) and [Phase 4 implementation report](docs/PHASE_4_IMPLEMENTATION_2026-11-08.md).


Yeh guide aapko Apex AI-Native IT Operating System ko **Hostinger Shared Web Hosting (Business Plan)** par deploy karne ke liye step-by-step instructions deti hai.

Hostinger Business Plan par aap ise do tareeqon se deploy kar sakte hain:
- **Method 1: Full-Stack Node.js App (Recommended)** — Isme Express backend, Gemini AI endpoints, aur React frontend sab Hostinger ke Node.js manager se chalte hain.
- **Method 2: Static Web App (Frontend Only)** — Agar aap sirf React frontend ko Hostinger ke `public_html` me LiteSpeed/Apache ke sath deploy karna chahte hain.

---

## 📁 Repository Structure Jo Hostinger ke Liye Configure Ki Gayi Hai

1. **`public/.htaccess`** ➔ Build time par automatic `dist/.htaccess` ban jata hai. Yeh Apache/LiteSpeed web server ko batata hai ki page refresh hone par `404 Not Found` na aaye aur SPA routes `index.html` par redirect hon.
2. **`server.js`** ➔ Hostinger hPanel ke Node.js Application Manager ka root entry point hai, jo production bundle `dist/server.cjs` ko safely trigger karta hai.
3. **`dist/server.cjs`** ➔ Saare backend API routes aur static file delivery ko single optimized CommonJS file me bundle karta hai.

---

## 🌟 METHOD 1: Full-Stack Node.js App (hPanel Node.js Selector)

Hostinger Business Plan me built-in **Node.js Application Manager** milta hai.

### Step 1: Project Files Download / Export karein
1. AI Studio ke top-right **Settings** ya menu se project ko **Export / Download ZIP** karein.
2. Local system par zip extract karke terminal me ek baar build verify karein:
   ```bash
   npm install
   npm run build
   ```
3. Ensure karein ki `dist/` folder me `index.html`, `server.cjs`, aur `assets/` generate ho chuke hain.

### Step 2: Files ko Hostinger me Upload karein
1. Hostinger **hPanel** login karein ➔ Apni website select karein.
2. **File Manager** (Files ➔ File Manager) open karein.
3. Node application checkout ko preferably **web-accessible `public_html` se alag** rakhein, aur database aur environment secrets dono ko publicly served assets se alag private paths mein store karein. Hosting plan constraints verify karein.
4. Apni project files upload karein:
   - `dist/` folder (pura folder)
   - `server.js`
   - `package.json`
   - Sensitive `.env` ko `public_html` mein upload **NA karein**; private hPanel environment configuration ya webroot ke bahar restricted file use karein.

### Step 3: Hostinger hPanel me Node.js Setup karein
1. hPanel left sidebar me **Advanced** ya **Website** ➔ **Node.js** par click karein.
2. **Create Application** button dabayein aur ye settings bharein:
   - **Node.js Version**: `20.x` (ya `18.x`)
   - **Application Mode**: `Production`
   - **Application Root**: private Node app root outside `public_html` if your Hostinger plan supports it; static frontend and API reverse proxy must be configured separately.
   - **Application Startup File**: `server.js`
3. **Environment Variables** section me add karein:
   - Key: `GEMINI_API_KEY` | Value: *[Aapki Google AI Studio Gemini API Key]*
   - Key: `NODE_ENV` | Value: `production`
   - Key: `APEX_DATA_FILE` | Value: **absolute writable private file** e.g. `/home/<user>/private/apex-os/app-store.json` (replace with your actual verified Hostinger path, do not use an example literally)
   - Key: `APEX_INITIAL_SETUP_TOKEN` | Value: strong one-time setup secret (first empty install only)
   - Key: `APEX_ALLOW_PRODUCTION_RESET` | Value: `false`
   - Key: `APEX_PUBLIC_ORIGIN` | Value: exact public HTTPS origin (e.g. `https://yourdomain.com`) for CSRF Origin comparisons; do not add a path.
   - Confirm the data file is **outside the deployed application checkout** and that a populated existing store was migrated offline with a private verified backup before startup.
4. Click **Create / Save**.

### Step 4: Dependencies Install aur App Start
1. Node.js manager screen par **NPM Install** button par click karein (ya SSH Terminal open karke `npm install --omit=dev` run karein).
2. **Restart** / **Start** button click karein.
3. HTTPS par health, login, role restrictions, persisted records aur logout ka smoke test karein. Sirf page load hone se platform production-certified ya integrations live **nahin** ho jate.

---

## 🌐 METHOD 2: Static Web App Deployment (Sirf Frontend)

Agar aap Node.js application manager use nahi karna chahte aur direct static hosting chahte hain: **ye sirf frontend assets serve karega. Backend APIs, login, live records aur mutations ke liye running Express service zaroori hai.**

1. Project build karein:
   ```bash
   npm run build
   ```
2. `dist/` folder ke andar ka saara content copy karein:
   - `index.html`
   - `.htaccess`
   - `assets/` folder
3. Hostinger **File Manager** me jaakar `public_html/` ke andar directly paste / upload kar dein.
4. Hostinger ka LiteSpeed web server `.htaccess` file ke zariye sabhi routes (`/itsm`, `/finance`, `/field-service`) ko bina 404 error ke render karega.

---

## 🔒 Security & Performance Features (Included in `.htaccess`)
Humne `.htaccess` me Hostinger ke liye ye production optimizations add kar di hain:
- ✅ **Automatic HTTPS Force**: HTTP requests automatically secure HTTPS par redirect hoti hain.
- ✅ **Single Page Application (SPA) Fallback**: Page refresh karne par 404 error nahi aata.
- ✅ **Gzip & Deflate Compression**: CSS, JS aur JSON files compress hoke fast load hoti hain.
- ✅ **Browser Caching**: Static assets 1 saal tak client browser me cache rehte hain.
- ✅ **Security Headers**: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`.

---

## 🛠️ Common Troubleshooting on Hostinger

| Problem | Cause | Solution |
| :--- | :--- | :--- |
| **503 Service Unavailable** | Node.js process crash ya startup file nahi mili | Check karein ki `dist/server.cjs` uploaded hai aur startup file me `server.js` set hai. hPanel me **Node.js Logs** check karein. |
| **404 on Refresh** | `.htaccess` missing hai ya upload nahi hui | Hostinger File Manager me check karein ki `.htaccess` hidden file visible hai aur `public_html` me maujood hai. |
| **AI Features Not Working** | `GEMINI_API_KEY` missing hai | Hostinger Node.js application settings me jakar Environment Variables me `GEMINI_API_KEY` add karke app Restart karein. |
