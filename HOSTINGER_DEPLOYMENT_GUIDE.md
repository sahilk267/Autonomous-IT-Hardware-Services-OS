# Hostinger Deployment — Phase M Staging (Fixed or Dynamic Workspace)

> **Security gate:** Phase M ke code mein PostgreSQL dynamic workspace selection aur staged Windows installer workflow hai, lekin **live Hostinger deployment/acceptance verify nahi hua**. [Phase M detailed release guide](docs/PHASE_M_RELEASE_READINESS.md) aur [Stage 3 DB migration](docs/PHASE_L_STAGE3_DATABASE_HARDENING.md) pehle padhein. Production approval pending hai.

Yeh guide aapko Apex AI-Native IT Operating System ko **Hostinger Shared Web Hosting (Business Plan)** par deploy karne ke liye step-by-step instructions deti hai.

Hostinger Business Plan par aap ise do tareeqon se deploy kar sakte hain:
- **Method 1: Full-Stack Node.js App (Recommended)** — Isme Express backend, Gemini AI endpoints, aur React frontend sab Hostinger ke Node.js manager se chalte hain.
- **Method 2: Static Web App (Frontend Only)** — Agar aap sirf React frontend ko Hostinger ke `public_html` me LiteSpeed/Apache ke sath deploy karna chahte hain.

---

## Windows client connects AFTER hosted deployment

**Same installer, any future server domain:** The Windows x64 preview installer now defaults to **Connect to hosted server**. Before your domain or Hostinger plan is finalized, leave the server URL blank and select **Save server details for later**. After this full-stack Express backend is live on HTTPS, open **Server → Configure / Change Server** in the Windows app, enter `https://your-domain.example` and test the connection. Desktop only receives the public web URL, not `DATABASE_URL`, `APEX_SETUP_TOKEN` or integration secrets.

**Required new API:** `GET /api/desktop/handshake` must return `product: "apex-it-os"`, a compatible desktop protocol and `deploymentMode: "hosted"`. React HTML and API must come from the **same HTTPS origin**. A static-only frontend is NOT sufficient for this Windows client.

After configuring Node.js and secrets in hPanel/server environment, run `npm run check:hosting` on the server when shell access permits. The checker never prints secrets. Once the staging domain is live, run `node scripts/hostinger-acceptance.mjs https://your-staging-domain.example`, which now validates the desktop handshake too. This is not a replacement for authenticated tenant/finance testing, Windows smoke testing or PostgreSQL recovery rehearsal.

**Do not expose the DB port to employee desktops.** In hosted mode, desktop connects over outbound HTTPS 443 to Express; the private database is accessible only from backend infrastructure. If your provider lacks a persistent Node process or external PostgreSQL connectivity, use an appropriate VPS/managed Node host instead of pretending a static hosting account is a full backend.

See [deploy-later topology and security checklist](docs/PHASE_M_HOSTED_DESKTOP_CONNECTION.md).

---

## 📁 Repository Structure Jo Hostinger ke Liye Configure Ki Gayi Hai

1. **`public/.htaccess`** ➔ Build time par automatic `dist/.htaccess` ban jata hai. Yeh Apache/LiteSpeed web server ko batata hai ki page refresh hone par `404 Not Found` na aaye aur SPA routes `index.html` par redirect hon.
2. **`server.js`** ➔ Hostinger hPanel ke Node.js Application Manager ka root entry point hai, jo production bundle `dist/server.cjs` ko safely trigger karta hai.
3. **`dist/server.cjs`** ➔ Saare backend API routes aur static file delivery ko single optimized CommonJS file me bundle karta hai.

---

## 🌟 METHOD 1: Full-Stack Node.js App (hPanel Node.js Selector)

Agar aapke Hostinger plan aur region me **Node.js Application Manager** available hai, tab Method 1 use karein.

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
3. Application root ko **public_html ke bahar private folder** me rakhein, agar hosting plan allow karta hai. Runtime JSON, `.env`, backups aur lock files kabhi webroot me na rakhein.
4. Apni project files upload karein:
   - `dist/` folder (pura folder)
   - `server.js`
   - `package.json`
   - Configuration **hPanel server-side environment variables** me set karein; `.env` ko publicly served folder me upload na karein.

### Step 3: Hostinger hPanel me Node.js Setup karein
1. hPanel left sidebar me **Advanced** ya **Website** ➔ **Node.js** par click karein.
2. **Create Application** button dabayein aur ye settings bharein:
   - **Node.js Version**: `22.x` (Phase K/L CI-validated; availability plan-dependent)
   - **Application Mode**: `Production`
   - **Application Root**: private application folder; hosting ke reverse-proxy setup se public HTTPS domain map karein
   - **Application Startup File**: `server.js`
3. **Environment Variables** section me minimum ye values set karein:
   - `NODE_ENV=production`
   - `APP_URL=https://yourdomain.com` (exact browser origin)
   - `APEX_STORAGE_MODE=postgres` (external managed PostgreSQL required)
   - `APEX_TENANT_MODE=fixed` with `APEX_TENANT_ID=<provisioned-uuid>`, **or** `APEX_TENANT_MODE=dynamic` without `APEX_TENANT_ID`
   - `APEX_DATA_DIR=/home/account/private/apex-data` (absolute writable persistent path; **webroot ke bahar**)
   - `APEX_SETUP_TOKEN=<random secret of 32+ characters>` (first admin setup ke liye)
   - Optional `APEX_ALLOWED_ORIGINS` sirf explicit HTTPS origins ke saath, wildcard nahi
   - `GEMINI_API_KEY` sirf jab AI capabilities chahiye
   - Do not add credentials to Vite frontend variables or Git.
4. HTTPS reverse proxy, public origin, write permission, persistent volume aur single-process hosting verify karein. Agar yeh available nahi hain, yahan deploy **mat** karein.
4. Click **Create / Save**.

### Step 4: Dependencies Install aur App Start
1. Node.js manager mein server-only dependencies install karein. Hostinger managed hosting npm commands build/redeploy ke waqt run karta hai; on its managed plans they are not generally executed through SSH. Set `ELECTRON_SKIP_BINARY_DOWNLOAD=1` for server-only builds.
2. **Restart** / **Start** button click karein.
3. Apna HTTPS URL open karke initial setup token enter karein. Login/logout, CSRF rejection, database persistence/restart aur private backup test **pass hone ke baad hi** pilot use karein. Sirf page load hona production acceptance nahi hai.

---

## 🌐 METHOD 2: Static Web App Deployment (Sirf Frontend)

Agar aap Node.js application manager use nahi karna chahte aur direct static hosting chahte hain:

1. Project build karein:
   ```bash
   npm run build
   ```
2. `dist/` folder ke andar ka saara content copy karein:
   - `index.html`
   - `.htaccess`
   - `assets/` folder
3. Hostinger **File Manager** me jaakar `public_html/` ke andar directly paste / upload kar dein.
4. SPA assets render ho sakte hain, **lekin is mode me Express API, authentication, business data, AI aur workflow features kaam nahi karenge**. Complete system ke liye secure running backend zaroori hai.

---

## 🔒 Security & Performance Features (Included in `.htaccess`)
`.htaccess` static Apache/LiteSpeed hosting ke liye configured hai; Node.js reverse proxy par headers/TLS policy separately verify karein. Yeh security controls ka replacement nahi hai:
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


## Phase L readiness and rollback

- `npm run lint`, `npm test`, `npm run test:postgres` (disposable local CI PostgreSQL database), aur `npm run build` ko review environment me verify karein.
- Production me `APEX_DATA_DIR` missing ya relative hone par app intentional fail-close karegi. 503/boot failure ka reason log me dekhein; fake demo data se bypass na karein.
- Backup: `node scripts/backup-data.mjs backup /absolute/private/apex-data/app-store.json /absolute/private/backups`.
- Verify manifest; restore **only to a new path**. Lock file after crash hataane se pehle confirm karein ki purana Node process band hai.
- Multi-instance scaling, real multi-tenant company isolation, PostgreSQL route migration, secrets management aur live Hostinger verification **abhi release blockers hain**.
