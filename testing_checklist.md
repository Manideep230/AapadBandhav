# Verification & Testing Checklist

This document details the verification and testing procedures to ensure that the migrated AapadBandhav serverless application works without regressions.

---

## 🔐 1. Authentication & Role Flow

* [ ] **Verify OTP Request**:
  * Send a POST request to `/api/auth/otp/send` with body `{"mobile": "9900001111"}` (or other seeded phone number).
  * Assert that the response contains `success: true` and the raw `otp` code (e.g. `123456`).
* [ ] **Verify OTP Logins**:
  * Send a POST request to `/api/auth/otp/verify` with body `{"mobile": "9900001111", "otp": "123456"}`.
  * Assert that a valid JWT token is returned, along with user role details.
* [ ] **Verify Role Redirection**:
  * Verify that a multi-role user (e.g. user who is both volunteer and citizen) is prompted for role selection.
  * Log in with different mock responder accounts (Ambulance: `9400001111`, Police: `9600001111`) and verify role-based JWT payload claims.

---

## 📡 2. Realtime Event Broadcasting (Pusher)

* [ ] **Verify Socket Connection Emulator**:
  * Open the React frontend in development.
  * Open browser developer console and verify connection messages: `[Pusher-Emulator] Connecting to Pusher...` and `[Pusher-Emulator] Pusher Connection Connected`.
* [ ] **Verify Active Watch Room**:
  * Open an accident page or dashboard.
  * Verify Pusher subscriptions in the console logs or Pusher Debug Console (e.g. `Subscribed to Pusher channel: accident-XYZ`).
* [ ] **Verify Channel Mapping**:
  * Ensure that listening to `accident:XYZ:chat` binds successfully to Pusher channel `accident-XYZ` and event `chat`.

---

## ⏱️ 3. Escalation Workflow (Inngest)

* [ ] **Trigger Workflow**:
  * Send a POST request to `/api/accidents/trigger` with a citizen JWT token.
  * Verify that `accident.triggered` Inngest event is dispatched.
* [ ] **Verify Phase 1 Dispatch**:
  * Verify that active responders within 8km are notified and added to the Alert table.
  * Check that emergency contacts receive mock SMS messages.
* [ ] **Verify Phase 2 Escalation**:
  * Leave the accident unacknowledged (do not accept alert) and wait 30 seconds.
  * Verify that search radius expands to 25km and a status log `alert_broadcasted` is appended.
* [ ] **Verify Phase 3 Critical Escalation**:
  * Wait another 30 seconds (60s total).
  * Verify that severity is updated to `critical` and search radius expands to 50km.

---

## 🏎️ 4. IoT Telemetry Webhook Ingest

* [ ] **Verify Telemetry Parsing**:
  * Send a POST request to `/api/iot/ingest` with body:
    ```json
    {
      "topic": "vehicle/device1/node1",
      "payload": "{\"latitude\": 16.5063, \"longitude\": 80.6480, \"speed\": 45.0, \"impactValue\": 1.2, \"batteryStatus\": 95}"
    }
    ```
  * Verify response is `success: true`.
  * Verify speed logs and coordinates update in MongoDB.
* [ ] **Verify Crash Detection Trigger**:
  * Send a POST request with `impactValue` set to `7.5` (representing crash G-force).
  * Assert that an accident entry is created automatically, status set to `active`, and Inngest workflow runs.
* [ ] **Verify Rest Segment Calculations**:
  * Send telemetry with speed `< 5.0` to verify a rest stop segment is generated.
  * Resume telemetry with speed `> 5.0` and verify the rest segment updates travel distance, duration, and path coordinates.

---

## 🗄️ 5. Evidence Uploads (Cloud Storage)

* [ ] **Verify Secure Buffer Upload**:
  * Upload a mock file via POST request to `/api/accidents/:id/upload-evidence`.
  * Confirm that the file is sent to Supabase Storage and a public HTTPS URL is returned.
* [ ] **Verify Large Media Support**:
  * Upload larger image and audio files to verify that Vercel serverless function request body limits (4.5MB for serverless) are respected and uploads are direct or streamed.
