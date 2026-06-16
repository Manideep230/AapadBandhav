import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
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

import { createServer } from 'http';
import { Server } from 'socket.io';
import { setIO } from './backend/services/realtime/socketStore';

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

setIO(io);

io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  socket.on('subscribe', (channel) => {
    socket.join(channel);
    console.log(`[Socket.IO] Client ${socket.id} subscribed/joined room: ${channel}`);
  });

  socket.on('unsubscribe', (channel) => {
    socket.leave(channel);
    console.log(`[Socket.IO] Client ${socket.id} unsubscribed/left room: ${channel}`);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🌐 Local backend server running on http://127.0.0.1:${PORT}`);
});
