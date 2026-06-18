import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import http from 'http';
import { createRateLimiter } from './backend/middleware/rateLimiter';

// Import serverless controllers
import authApp from './api/auth';
import accidentsApp from './api/accidents';
import adminApp from './api/admin';
import devicesApp from './api/devices';
import iotApp from './api/iot';
import inngestApp from './api/inngest';
import profileApp from './api/profile';
import locationsApp from './api/locations';
import notificationsApp from './api/notifications';
import swaggerApp from './backend/api/swagger';

const app = express();
app.use(express.json());
app.use(cors());

// Apply global rate limiting (max 100 requests/min)
app.use(createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP. Please try again after 60 seconds.'
}));

// Serve uploaded files statically under /api/uploads
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount the exact serverless route targets
app.use(authApp);
app.use(accidentsApp);
app.use(adminApp);
app.use(devicesApp);
app.use(iotApp);
app.use('/api/inngest', inngestApp);
app.use(profileApp);
app.use(locationsApp);
app.use(notificationsApp);
app.use(swaggerApp);

// ── Realtime: EMQX MQTT (stateless HTTP publisher) ───────────────────────────
// No local Socket.IO server needed — the backend publishes events via
// EMQX HTTP REST API and the browser connects directly to the EMQX broker
// over WSS. Nothing to set up locally for realtime.
// RealtimeService reads EMQX_HOST / EMQX_API_KEY from .env automatically.

const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🌐 Local backend server running on http://127.0.0.1:${PORT}`);
  console.log(`📡 Realtime: EMQX MQTT broker at ${process.env.EMQX_HOST || '(unconfigured)'}:${process.env.EMQX_HTTP_PORT || '8443'}`);
});
