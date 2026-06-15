# AapadBandhav Platform - Complete Dependency Audit Report

**Date of Audit**: June 15, 2026  
**Auditor**: Antigravity Package Auditor  
**Platform Status**: Cleaned & Pruned

---

## 1. Required Dependencies Report

The following packages are confirmed as **required** and actively imported in the core application logic:

### 1.1 Backend Core
- **`@prisma/client`**: DB access layer client for MongoDB Atlas connection.
- **`@supabase/supabase-js`**: Cloud Storage Client for stateless accident evidence uploads.
- **`axios`**: Outgoing HTTP request client for NighaTech SMS gateway API.
- **`bcryptjs`**: Cryptographic password hashing and matching helper for sub-admin login.
- **`cors`**: Express CORS middleware for endpoint protection.
- **`dotenv`**: Config loader for environmental variables.
- **`express`**: Base web server and serverless router.
- **`form-data`**: Multipart request generation for validation scripts.
- **`inngest`**: Stateless background event workflow engine.
- **`jsonwebtoken`**: JWT generation and parsing utility for auth state.
- **`multer`**: Multipart form data middleware for handling evidence files.
- **`prisma`**: CLI tool for schema pushes and generation.
- **`pusher`**: Pusher Channels trigger client for real-time events.

### 1.2 Frontend Core
- **`axios`**: Endpoint request client.
- **`html5-qrcode`**: QR scanner library.
- **`leaflet`**: Map rendering library.
- **`pusher-js`**: Client-side Pusher subscriber.
- **`qrcode`**: QR code generation library.
- **`react` & `react-dom`**: UI rendering core.
- **`react-hot-toast`**: Toast notification utility.
- **`react-router-dom`**: Routing engine.
- **`recharts`**: Dashboard visualization charts.

---

## 2. Unused Dependencies Report

The following packages were declared in `package.json` configurations but **never imported** anywhere in the code:

### 2.1 Backend
- *None.* All declared packages in the root `package.json` are actively utilized in either backend controllers or infrastructure verification scripts.

### 2.2 Frontend
- **`date-fns`**: Declared in `frontend/package.json` but not used (no imports found in `frontend/src`).
- **`react-leaflet`**: Leaflet React wrapper library, declared in dependencies but never imported (custom Leaflet implementation in `MapView.jsx` is used directly instead).

---

## 3. Dependency Cleanup Report

The following actions were taken to prune the workspace:

1. **`socket.io-client` Removal**: Verified that `socket.io-client` was completely removed from the frontend (transitioned fully to Pusher Channels for real-time telemetry).
2. **Flask/Python Cleanup**: Legacy Python backend (`requirements.txt`, Flask packages, sqlite files) has been deleted.
3. **Unused Frontend Dependencies Purged**:
   - Removed `date-fns` from `frontend/package.json`.
   - Removed `react-leaflet` from `frontend/package.json`.
4. **Package Tree Pruned**:
   - Executed `npm install` inside the `frontend/` directory.
   - Successfully removed **3 unused packages** from `node_modules`.

---

## 4. Dependency Vulnerability Report

A summary of active vulnerabilities is outlined below:

| Project Root | Package Name | Severity | Direct/Transitive | Impacted Version | Fix Recommendation |
| --- | --- | --- | --- | --- | --- |
| **Backend** | `ajv` | Moderate | Transitive (via `@vercel/node`) | `<8.17.2` | Upgrade `@vercel/node` to `v4.0.0+` (breaking change) |
| **Backend** | `esbuild` | High | Transitive (via `@vercel/node`) | `<0.28.1` | Upgrade `@vercel/node` to `v4.0.0+` (breaking change) |
| **Backend** | `minimatch` | High | Transitive (via `@vercel/node`) | `<10.2.3` | Upgrade `@vercel/node` to `v4.0.0+` (breaking change) |
| **Backend** | `path-to-regexp` | High | Transitive (via `@vercel/node`) | `<6.3.0` | Upgrade `@vercel/node` to `v4.0.0+` (breaking change) |
| **Backend** | `smol-toml` | Moderate | Transitive (via `@vercel/node`) | `<1.6.1` | Run `npm audit fix` |
| **Backend** | `undici` | High | Transitive (via `@vercel/node`) | `<=6.23.0` | Upgrade `@vercel/node` to `v4.0.0+` (breaking change) |
| **Frontend** | `esbuild` | High | Transitive (via `vite`) | `<=0.28.0` | Upgrade `vite` to `v6.4.3` (breaking change) |
| **Frontend** | `vite` | Moderate | Direct | `<=6.4.1` | Upgrade `vite` to `v6.4.3` (breaking change) |

All critical direct runtime dependencies for both the frontend and backend are completely free of vulnerabilities.
