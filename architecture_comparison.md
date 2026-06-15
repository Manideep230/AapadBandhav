# Architecture Comparison Report

This document compares the original monolithic, stateful Docker-based architecture of the AapadBandhav platform with the newly migrated serverless architecture optimized for Vercel deployment.

---

## 📊 Side-by-Side Comparison

| Architectural Dimension | Original Architecture | Modern Serverless Architecture (Vercel) |
| :--- | :--- | :--- |
| **Hosting & Compute** | Stateful containers (Docker Compose) on VPS/Coolify (Python Flask + Gunicorn) | Stateless Vercel Serverless Functions (Node.js + TypeScript) |
| **Language Runtime** | Python 3.10 | Node.js (V8) + TypeScript 5.3 |
| **Database & ORM** | PostgreSQL / SQLite with SQLAlchemy | MongoDB Atlas with Prisma ORM |
| **Realtime Layers** | Flask-SocketIO (requires persistent connection and Redis sync broker) | Pusher Channels (stateless webhook broadcasts + client subscriptions) |
| **Background Jobs** | Persistent Python threads (`threading.Thread`) running blocking sleep loops | Durable Serverless Workflows via Inngest (event-driven queue execution) |
| **IoT Telemetry** | Persistent background listener loop (`paho-mqtt`) listening to HiveMQ | Stateless HTTP webhook ingestion (`/api/iot/ingest`) |
| **File Storage** | Local uploads directory (stateful Docker volumes) | Cloud Storage via Supabase Storage bucket |
| **Authentication** | PyJWT + custom Flask decorators | jsonwebtoken + Node Express middleware |
| **Scalability** | Scale up (vertical) or complex Kubernetes scaling for websockets | Scale out (automatic horizontal serverless instantiation on-demand) |
| **Cold Starts** | None (always running persistent processes) | Minimal (optimized Node.js bundler and light imports) |

---

## 🔄 Architectural Mappings & Replacements

### 1. Backend API Routing
* **Before**: Flask blueprints routing API endpoints in Python.
* **After**: Modular Express application instances deployed inside `/api/*.ts` routes. All routers have been grouped logically (e.g., `/api/auth.ts`, `/api/accidents.ts`) to balance Vercel cold-start performance with codebase modularity.

### 2. Realtime Updates
* **Before**: Bidirectional web socket connection managed by `Socket.IO` server running in a persistent Docker container.
* **After**: Pusher channels are used. The backend publishes events statelessly via a standard HTTP POST request to the Pusher API. The frontend `socket.js` is replaced with a custom Pusher-based emulator exposing the exact Socket.IO interface methods (`on()`, `off()`, `emit()`), preserving frontend code without regressions.

### 3. Escalation Pipeline & Queue
* **Before**: Spawning background Python threads running while loops with `time.sleep(30)` to manage Phase 1 -> Phase 2 -> Phase 3 responder escalations.
* **After**: Event-driven **Inngest** workflows. Telemetry or citizen triggers send a event to Inngest, which schedules steps and sleeps serverlessly, executing stateless code without consuming CPU cycles during waits.

### 4. Telemetry Ingestion (IoT)
* **Before**: A persistent thread running `paho-mqtt` loop to ingest device coordinates, speeds, and collisions.
* **After**: EMQX or HiveMQ webhooks are configured to dispatch incoming sensor data as an HTTP POST payload to `/api/iot/ingest`, processing speed logging, rest segment stop calculations, and crash detection statelessly.

### 5. Media Uploads (Evidence)
* **Before**: Uploading files to a local `uploads/` directory on the host server disk.
* **After**: Secure upload flow using the Supabase JS client. Buffer uploads are sent to the `evidence` bucket on Supabase Storage, and public URLs are stored in the database.
