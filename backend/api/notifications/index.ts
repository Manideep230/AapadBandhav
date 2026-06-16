import express from 'express';
import cors from 'cors';
import prisma from '../../config/db';
import { withAuth, AuthenticatedRequest } from '../../middleware/auth';

const router = express.Router();

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Get my notifications
 *     description: Returns the last 50 in-app notifications for the authenticated entity.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Notification list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 notifications:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Notification'
 */
router.get('/api/notifications', withAuth(async (req: AuthenticatedRequest, res) => {
  const entityId = req.entityId || '';
  try {
    const notifications = await prisma.notification.findMany({
      where: { entityId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return res.status(200).json({ success: true, notifications });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

/**
 * @swagger
 * /api/notifications/fcm-token:
 *   post:
 *     tags: [Notifications]
 *     summary: Register FCM push notification token
 *     description: Stores the Firebase Cloud Messaging (FCM) device token for the authenticated entity, enabling push notifications on accident and dispatch events.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fcm_token]
 *             properties:
 *               fcm_token:
 *                 type: string
 *                 example: "cNHj4dMoQ-GhV5kTkZY9xE:APA91bHqz..."
 *                 description: Firebase Cloud Messaging device token
 *     responses:
 *       200:
 *         description: FCM token registered
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 */
router.post('/api/notifications/fcm-token', withAuth(async (req: AuthenticatedRequest, res) => {
  const { fcm_token, fcmToken } = req.body || {};
  const token = fcmToken || fcm_token;
  if (!token) {
    return res.status(422).json({ success: false, message: 'fcm_token is required' });
  }
  try {
    const role = req.entityRole || 'user';
    const id = req.entityId || '';
    // Store FCM token on the entity
    if (['user', 'volunteer', 'fire_department', 'emergency_personnel'].includes(role)) {
      await prisma.user.update({ where: { id }, data: { fcmToken: token } as any });
    } else if (role === 'hospital') {
      await prisma.hospital.update({ where: { id }, data: { fcmToken: token } as any }).catch(() => {});
    } else if (role === 'ambulance') {
      await prisma.ambulanceDriver.update({ where: { id }, data: { fcmToken: token } as any }).catch(() => {});
    } else if (role === 'policeman') {
      await prisma.policeman.update({ where: { id }, data: { fcmToken: token } as any }).catch(() => {});
    }
    return res.status(200).json({ success: true, message: 'FCM token registered' });
  } catch (error: any) {
    // Not all entities may have fcmToken field – graceful degradation
    return res.status(200).json({ success: true, message: 'FCM token noted (field may not be persisted on this entity type)' });
  }
}));

const app = require('express')();

app.use(cors());
app.use(express.json());
app.use(router);

export default app;
