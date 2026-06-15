# Migration Report - AapadBandhav Serverless Transition

This report details the execution of the architectural migration of the AapadBandhav platform to a modern serverless architecture optimized for Vercel.

---

## 📝 Executive Summary

The AapadBandhav platform has been migrated from a Python/Flask stateful, container-dependent codebase to a unified Node.js/TypeScript serverless deployment. All business logic, geofencing coordinates, 3-phase accident dispatch escalations, and realtime events have been preserved. 

* **Type Safety**: The backend has been completely rewritten in TypeScript, compiling with no type errors.
* **Serverless Compatibility**: Long-running processes (Socket.IO server, background threads, and MQTT listeners) have been replaced with stateless equivalents (Pusher, Inngest, and HTTP ingestion webhook).
* **Database Modernization**: Migrated database layer to MongoDB Atlas with Prisma ORM.

---

## 📦 Dependency Modifications

### Removed Dependencies (Flask/Docker stack)
* `Flask` & `Flask-Cors` (Web routing)
* `Flask-SocketIO` & `python-socketio` (Stateful socket connections)
* `Flask-SQLAlchemy` & `SQLAlchemy` (ORM)
* `paho-mqtt` (Persistent MQTT loop listener)
* `PyJWT` (Authentication tokens)
* `bcrypt` (Password hashing)
* `psycopg2-binary` (PostgreSQL driver)
* `gunicorn` (WSGI server)
* `redis` (Socket.IO cluster syncing)

### Newly Added Dependencies (Serverless Node stack)
* `express` & `@types/express` (REST handler framework)
* `cors` & `@types/cors` (Cross-Origin Resource Sharing)
* `@prisma/client` & `prisma` (MongoDB database client and ORM)
* `pusher` (Stateless realtime publisher)
* `pusher-js` (Frontend realtime client)
* `inngest` (Durable serverless workflows)
* `@supabase/supabase-js` (Supabase evidence cloud storage)
* `multer` & `@types/multer` (Multipart upload handling)
* `jsonwebtoken` & `@types/jsonwebtoken` (JWT creation/verification)
* `bcryptjs` & `@types/bcryptjs` (Password hashing)
* `axios` (SMS gateway HTTP caller)
* `@vercel/node` (Vercel serverless request/response types)

---

## 📁 Modified and Added Files

* **`package.json`**: Updated with backend scripts, devDependencies, and unified build scripts.
* **`tsconfig.json`**: Configured compiler settings for serverless TypeScript routes.
* **`vercel.json`**: Added routing tables redirecting REST API calls to the serverless routes.
* **`prisma/schema.prisma`**: Relational MongoDB database mapping with 28 models.
* **`prisma/seed.ts`**: Reimplemented seed script generating mock users, hospitals, police, devices, and responders. Corrects legacy unique ID constraints for volunteer/fire roles.
* **`api/utils/`** (Shared Helpers):
  - [jwt.ts](file:///e:/NighaTech/AapadBandhav/api/utils/jwt.ts): Core token signing and verification.
  - [pusher.ts](file:///e:/NighaTech/AapadBandhav/api/utils/pusher.ts): Stateless realtime triggers.
  - [supabase.ts](file:///e:/NighaTech/AapadBandhav/api/utils/supabase.ts): Supabase evidence storage broker.
  - [sms.ts](file:///e:/NighaTech/AapadBandhav/api/utils/sms.ts): SMS gateway integration with SSL bypass.
  - [gps.ts](file:///e:/NighaTech/AapadBandhav/api/utils/gps.ts): Geolocation distances and stop segment state machine.
  - [auth.ts](file:///e:/NighaTech/AapadBandhav/api/utils/auth.ts): Express JWT middleware with role validation and CORS headers.
* **`api/`** (Serverless Express Routes):
  - [auth.ts](file:///e:/NighaTech/AapadBandhav/api/auth.ts): OTP verify, send, registration, and admin login.
  - [profile.ts](file:///e:/NighaTech/AapadBandhav/api/profile.ts): General profile CRUD and emergency contact management.
  - [accidents.ts](file:///e:/NighaTech/AapadBandhav/api/accidents.ts): Incident reporting, manual responder assigning, chat logs, and evidence uploads.
  - [devices.ts](file:///e:/NighaTech/AapadBandhav/api/devices.ts): Linked/shared devices, QR registration, stops telemetry.
  - [locations.ts](file:///e:/NighaTech/AapadBandhav/api/locations.ts): Live coordinate updates, active responder maps, alert acceptance, geofenced route tracking, and health status endpoints.
  - [iot.ts](file:///e:/NighaTech/AapadBandhav/api/iot.ts): Webhook ingestion endpoint for IoT telemetry processing, crash detection, and dispatching Inngest workflows.
  - [inngest.ts](file:///e:/NighaTech/AapadBandhav/api/inngest.ts): Inngest serve handler defining the durable 3-phase escalation workflow.
* **`frontend/src/api/socket.js`**: Replaced Socket.IO client dependency with a custom `PusherSocketEmulator` that wraps `pusher-js` and exposes the exact Socket.IO event handler API, preventing frontend code regressions.

---

## 🌱 Database Seeding & Migration Strategy

For MongoDB Atlas, schema migrations (`prisma migrate`) are not used because MongoDB is schema-less. Instead, we push the schema and seed mock data:

1. **Push Schema to MongoDB**:
   ```bash
   npx prisma db push
   ```
2. **Seed Mock Entities**:
   ```bash
   npx prisma db seed
   ```
   This clears collections and recreates the baseline mock data (3 hospitals, 3 ambulance drivers, 3 police stations, 3 policemen, 3 mechanics, 3 insurance companies, 3 volunteers, 3 fire rescue stations, and 5 inactive telemetry devices).
