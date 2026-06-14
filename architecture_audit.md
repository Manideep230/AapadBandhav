# AapadBandhav Platform - Technology Stack Discovery & Architecture Audit

This report presents a comprehensive discovery and architectural audit of the AapadBandhav platform, mapping all existing frontend, backend, database, realtime, IoT, infrastructure, and deployment configurations.

---

## 🔍 Step 1 & 2: Full Project Analysis & Audit Report

### 1. Current Frontend Stack
- **Framework**: React.js (`^18.2.0` / `react-dom ^18.2.0`)
- **Language**: JavaScript (ES6+ / JSX)
- **Build Tool / Bundler**: Vite (`^5.0.6` / `@vitejs/plugin-react ^4.2.1`)
- **State Management**: React Hooks (`useState`, `useEffect`) and React Context (`AuthContext.jsx`)
- **UI Libraries**: Vanilla CSS (sleek dark mode, custom styling variables, custom grids) and Recharts (`^2.10.1`) for telemetry/analytics charting. Toast alerts managed via `react-hot-toast` (`^2.4.1`).
- **Mapping Libraries**: Leaflet (`^1.9.4`) and React Leaflet (`^4.2.1`) for real-time dispatch routes and responder location coordinates.
- **Authentication Client**: LocalStorage JWT caching with automated Axios request headers and interceptors for 401 token revocation redirects.

### 2. Current Backend Stack
- **Programming Language**: Python (specifically target running on Python 3.12-slim)
- **Framework**: Flask (`>=3.0.0`) with `flask-cors` origin filtering.
- **API Architecture**: RESTful API endpoints coupled with WebSocket sockets.
- **Authentication System**: PyJWT (`^2.8.0`) and Bcrypt (`^4.1.0`) for encryption and validation.
- **Background Processes**: Native Python threading (`threading.Thread`) for concurrent MQTT event listeners and asynchronous dispatch pipeline loops (e.g., escalating response zones from 8km to 50km).
- **Production Server**: Gunicorn (`>=21.2.0`) configured with the thread worker class (`gthread`) for concurrent execution (1 worker, 100 threads).

### 3. Current Database Stack
- **Database Engines (Multi-Dialect)**:
  - **SQLite**: Local developer baseline (uses file `database.sqlite`).
  - **PostgreSQL**: Production connection via SQL drivers (`psycopg2-binary>=2.9.0`).
  - **MongoDB**: Dynamically enabled via `DB_DIALECT=mongodb` (configured in `.env` using MongoDB Atlas uri connections).
- **ORM & Object Mapping**:
  - SQLAlchemy (`>=2.0.0`) is the core ORM.
  - Custom emulation layers (`MongoQuery` and `MongoSession` in `src/config/db.py`) map SQLAlchemy query filters dynamically to MongoDB queries (using `$or`, `$and`, `$in`, `$nin`, and cursor skip/limits).
- **Database Migrations**: No migration systems (like Alembic) are used. Schemas are auto-built at runtime via `Base.metadata.create_all(bind=engine)`.

### 4. Current Authentication Stack
- **Citizen Auth**: Passwordless login using Mobile Number + 6-digit random OTP verified via SMS gateway endpoints (`https://43.252.88.250/index.php/smsapi/httpapi/`).
- **Emergency Services & Admin Auth**: Traditional Email + Password logins with JWT signing.
- **Authorization & Guards**: Custom decorator filters (`@authenticate_jwt`, `@require_user_role`, `@require_admin_role`) parsing payloads and enforcing Role-Based Access Control (RBAC).

### 5. Current Realtime Stack
- **Bidirectional Sockets**: Socket.IO client (`socket.io-client ^4.6.1`) and server (`flask-socketio ^5.3.6`) with `simple-websocket` fallback transports.
- **Realtime Broadcasts**:
  - `entity:register` (tracks socket mappings)
  - `location:update` / `entity:location` (shares real-time responder and citizen map markers)
  - `accident:new` / `accident:dispatched` (real-time broadcast of emergency coordinates)
  - `alert:acknowledge` (broadcasts response accepts/rejects)

### 6. Current IoT Stack
- **Broker Integration**: Communicates via HiveMQ Public Broker (`broker.hivemq.com` port `1883`) using `paho-mqtt` client loops.
- **MQTT Topics Subscribed**:
  - Telemetry logs: `vehicle/+/FB`, `vehicle/+/RB`, `vehicle/+/FL`, `vehicle/+/FR`, `vehicle/+/RL`, `vehicle/+/RR`, `vehicle/+/L`, `vehicle/+/R`
  - Control streams: `aapadbandhav/device/status`, `aapadbandhav/device/heartbeat`, `aapadbandhav/device/location`, `aapadbandhav/device/accident`, `aapadbandhav/device/speed`, `aapadbandhav/device/node`
- **Telemetry Parsing**: Captures collision impact parameters (`impactValue >= 3.0G`), coordinates, speeds, and battery indicators from nodes, logging them to `IoTNode` and triggering dispatch threads.

### 7. Current Infrastructure Stack
- **Dockerization**: Single multi-stage `Dockerfile` in the root:
  - **Stage 1 (Frontend Builder)**: Node:18-alpine, runs `npm run build` using the React configuration.
  - **Stage 2 (Runner)**: Python:3.12-slim, installs build dependencies (`libpq-dev`), pip installs backend dependencies, copies the built React assets (`/app/frontend/dist`), and launches Gunicorn on port 5000.
- **CI/CD Pipeline**: GitHub Actions file `.github/workflows/deploy.yml` builds and pushes the Docker container to GitHub Container Registry (`ghcr.io`).

### 8. Current Storage Stack
- **Local Storage**: File uploads are routed to the local filesystem (stored in `backend/uploads`) with constraints (`MAX_FILE_SIZE_MB=5` and folder definitions in `.env`).

### 9. Current Documentation Stack
- **OpenAPI/Swagger Spec**: Hardcoded OpenAPI JSON dictionary endpoints exposed dynamically at `/api/openapi.json`.
- **Developer Documentation**: Custom rendering dashboard (`ApiDocsPortal.jsx`) reading raw OpenAPI specifications to generate interactive request sandboxes, descriptions, and payload formats.

---

## 🕳️ Step 3: Identify Gaps & Vulnerabilities

1. **GitHub Actions Workflow Misconfiguration**:
   - The `.github/workflows/deploy.yml` file contains a legacy backend step:
     ```yaml
     - name: Install Backend Dependencies
       run: |
         cd backend
         npm ci
     ```
     This step attempts to execute `npm ci` inside `backend`, but there is **no `package.json`** in that directory since the backend was modularized into Python. This causes the CI/CD pipeline execution to crash on push to `main`.
2. **Missing Database Migration Tooling**:
   - Schema alterations rely on `Base.metadata.create_all`, which cannot execute incremental schema upgrades in PostgreSQL without dropping tables or raising constraint violations.
3. **No Private/Production-Grade MQTT Broker**:
   - The platform relies on a public broker (`broker.hivemq.com`). Telemetry and coordinates of private vehicle crashes are published in plaintext without TLS or authentication, posing a severe privacy and security leak.
4. **Local File Storage Limitations**:
   - Storing media uploads on the local server container causes uploaded driver's licenses or accident pictures to be permanently deleted when the container restarts or redeploys.
5. **No Caching / Lock Broker (Redis)**:
   - Real-time coordination and socket registration maps are stored in memory (`connected_entities = {}` in `app.py`). Running Gunicorn with multiple workers (scale-out) would isolate socket instances, preventing admins from communicating with responders connected to different worker processes.

---

## 💡 Step 4: Recommendations

1. **Fix the CI/CD Pipeline Workflow**:
   - Remove the `npm ci` step in the backend portion of `.github/workflows/deploy.yml` and replace it with Python package installation checks (e.g., `pip install -r requirements.txt`).
2. **Deploy an Authenticated Private MQTT Broker**:
   - Switch from `broker.hivemq.com` to an authenticated EMQX or Mosquitto instance using TLS on port 8883, with device ACL authorizations to prevent unauthorized telemetry snooping.
3. **Configure AWS S3 or MinIO for Media Storage**:
   - Abstract the file upload layer to support S3-compliant object storage, ensuring uploaded driver files and accident images persist independently of Docker container Lifecycles.
4. **Introduce Redis for Flask-SocketIO and Caching**:
   - Use Redis as the message queue/message broker for Flask-SocketIO (`socketio = SocketIO(..., message_queue='redis://')`) to enable seamless scale-out across multiple Gunicorn workers and Docker container replicas.

---

## 📋 Step 5: Final Architecture Output

### Current Frontend Stack
* **Framework**: React.js v18.2
* **Language**: JavaScript (ES6+)
* **Build Tool**: Vite v5.0.6
* **State Management**: React Context / Hooks
* **UI/Visuals**: Vanilla CSS (Premium Dark Theme), Recharts (Graphs)
* **Maps**: Leaflet / React-Leaflet
* **Auth Storage**: LocalStorage JWT caching

### Current Backend Stack
* **Language**: Python 3.12
* **Web Framework**: Flask v3.0.0
* **API Architecture**: REST APIs + Socket.IO WebSockets
* **Background Jobs**: Concurrent Python Threads (`threading.Thread`)
* **Production Server**: Gunicorn (using `gthread` worker mode)

### Current Database Stack
* **Engine Support**: SQLite (Local Dev) / PostgreSQL & MongoDB (Production)
* **ORM**: SQLAlchemy v2.0
* **Emulation Wrapper**: Custom `MongoQuery` and `MongoSession` translation layers mapping SQLAlchemy queries to MongoDB queries.
* **Migrations**: None (Automatic runtime creation)

### Current Authentication Stack
* **Citizen Users**: Passwordless Mobile Number + OTP validation (via SMS Http gateway API).
* **Emergency Personnel & Admins**: Traditional Email + Password.
* **Access Control**: Role-Based Access Control (RBAC) enforced via `@authenticate_jwt`, `@require_user_role`, and `@require_admin_role` decorators.

### Current Realtime Stack
* **WebSockets**: Socket.IO (`flask-socketio` and `socket.io-client` with polling & websocket transports).
* **Client Synchronization**: Real-time event listeners syncing accident dispatch pipelines, responder paths, and socket lifecycle indicators.

### Current IoT Stack
* **Broker Host**: `broker.hivemq.com` (port 1883, public & unencrypted)
* **Libraries**: `paho-mqtt` (MQTT Python client)
* **Topic Routing**: telemetry and speed logs parsed from `vehicle/+/+` and `aapadbandhav/device/+`.

### Current Infrastructure Stack
* **Containerization**: Single Multi-Stage `Dockerfile` building static React assets via Node.js and mounting them to the Python Gunicorn runner server.
* **Container Registries**: GitHub Container Registry (`ghcr.io`).

### Current Deployment Stack
* **Execution Environment**: DigitalOcean App Platform / Heroku (Gunicorn runner binding port dynamically from environment variables via Procfile).

### Current Documentation Stack
* **Specification**: Hardcoded OpenAPI Spec JSON endpoint at `/api/openapi.json`.
* **Portal**: Premium React playground interface (`ApiDocsPortal.jsx`) displaying schemas, examples, and routes.

### Recommended Production Stack
* **Frontend**: React.js v18 + Vite (extend current stack).
* **Backend**: Flask + Gunicorn (extend current stack).
* **Database**: PostgreSQL (robust transactions, relational consistency for safety records) or MongoDB (for high-throughput IoT raw logs).
* **Realtime**: Socket.IO backed by **Redis** as a message broker.
* **IoT Broker**: EMQX or Eclipse Mosquitto with TLS authentication.
* **Storage**: Amazon S3 or DigitalOcean Spaces (S3 API).

### Recommended Docker Architecture
* **Docker Compose Workspace**: Introduce a multi-container Docker compose layout containing:
  - **`app`**: The existing multi-stage Python Flask/React app.
  - **`db`**: PostgreSQL container with health checks and persistent volume mount.
  - **`redis`**: Redis instance caching socket mappings and serving as message queue.
  - **`mqtt-broker`**: Mosquitto container with custom authentication files.

### Recommended Deployment Architecture
* **DigitalOcean Kubernetes (DOKS) or AWS ECS**:
  - Deploy Dockerized App replicas behind an Application Load Balancer.
  - Bind Flask-SocketIO using a Redis connection pool.
  - Direct static files to a CDN (e.g. Cloudflare) to offload static assets from Gunicorn.
  - Secure communication between IoT devices and the Mosquitto container using Let's Encrypt TLS certificates.
