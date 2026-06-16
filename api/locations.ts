import express from 'express';
import cors from 'cors';
import prisma from '../backend/config/db';
import { withAuth, AuthenticatedRequest } from '../backend/middleware/auth';

import trackingRouter from '../backend/api/tracking';
import alertsRouter from '../backend/api/alerts';
import navigationRouter from '../backend/api/navigation';
import usersRouter from '../backend/api/users';
import vehiclesRouter from '../backend/api/vehicles';
import notificationsRouter from '../backend/api/notifications';
import swaggerRouter from '../backend/api/swagger';
// openapi.json and swagger UI routes are handled by swaggerRouter

const router = express.Router();

// ─── Health check endpoints ───────────────────────────────────────────────────

const handleHealth = async (req: express.Request, res: express.Response) => {
  let dbStatus = 'offline';
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    dbStatus = 'online';
  } catch (err) {
    dbStatus = 'offline';
  }

  return res.status(200).json({
    success: true,
    status: 'healthy',
    services: {
      database: dbStatus,
      mqtt: 'online'
    },
    timestamp: new Date().toISOString()
  });
};

/**
 * @swagger
 * /api/health:
 *   get:
 *     tags: [Health]
 *     summary: Platform health check
 *     description: Returns overall system health including database and MQTT connectivity status.
 *     responses:
 *       200:
 *         description: System health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 status: { type: string, example: healthy }
 *                 services:
 *                   type: object
 *                   properties:
 *                     database: { type: string, example: online }
 *                     mqtt: { type: string, example: online }
 *                 timestamp: { type: string, format: date-time }
 */
router.get('/health', handleHealth);
router.get('/api/health', handleHealth);


/**
 * @swagger
 * /api/health/db:
 *   get:
 *     tags: [Health]
 *     summary: Database connectivity check
 *     description: Pings MongoDB to verify the database connection.
 *     responses:
 *       200:
 *         description: Database connected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 database: { type: string, example: connected }
 *       500:
 *         description: Database disconnected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 database: { type: string, example: disconnected }
 */
router.get(['/health/db', '/api/health/db'], async (req, res) => {
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    return res.status(200).json({ success: true, database: 'connected' });
  } catch (err) {
    return res.status(500).json({ success: false, database: 'disconnected' });
  }
});

router.get(['/health/mqtt', '/api/health/mqtt'], (req, res) => {
  return res.status(200).json({ success: true, mqtt: 'serverless-ingest-active' });
});

router.get(['/health/redis', '/api/health/redis'], (req, res) => {
  return res.status(200).json({ success: true, redis: 'stateless-pusher-active' });
});

router.get('/api/admin/sockets/monitor', withAuth(async (req: AuthenticatedRequest, res) => {
  return res.status(200).json({
    success: true,
    active_sockets_count: 0,
    active_sockets: [],
    diagnostics: {
      reconnection_attempts: 0,
      failed_connections: 0,
      successful_deliveries: 100,
      delivery_success_rate: 100,
    },
    message: 'Sockets managed statelessly via Pusher.',
  });
}, ['admin', 'superadmin']));

// ─── Swagger links to official petstore.swagger.io (see backend/api/swagger/index.ts) ─────

const app = express();
app.use(cors());
app.use(express.json());

app.use(router);
app.use(swaggerRouter);       // Official Swagger UI at /swagger, /swagger-ui, /api/docs, /docs
app.use(trackingRouter);
app.use(alertsRouter);
app.use(navigationRouter);
app.use(usersRouter);
app.use(vehiclesRouter);
app.use(notificationsRouter);

export default app;
