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

/**
 * @swagger
 * /api/notifications/vapid-public-key:
 *   get:
 *     tags: [Notifications]
 *     summary: Get VAPID public key for Web Push
 *     description: Returns the public key used to subscribe the client browser to push notifications.
 *     responses:
 *       200:
 *         description: VAPID public key
 */
router.get('/api/notifications/vapid-public-key', (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY || 'BNOUYEYKstcUgzjm2pbwBa7yjZ8hkjsgbY-ooInmmiAVWgdpMJZZ9xFiA9C0c02RtD0pDwmOMTrymQqJ0mfe3gQ';
  return res.status(200).json({ success: true, publicKey });
});

/**
 * @swagger
 * /api/notifications/subscribe:
 *   post:
 *     tags: [Notifications]
 *     summary: Register Web Push subscription
 *     description: Registers a push subscription (endpoint, keys) for the authenticated browser/entity.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subscription]
 *     responses:
 *       200:
 *         description: Subscription saved successfully
 */
router.post('/api/notifications/subscribe', withAuth(async (req: AuthenticatedRequest, res) => {
  const { subscription } = req.body || {};
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ success: false, message: 'Invalid subscription payload' });
  }

  const role = req.entityRole || 'user';
  const id = req.entityId || '';

  try {
    const auth = subscription.keys?.auth || '';
    const p256dh = subscription.keys?.p256dh || '';

    // Upsert or create subscription (cast needed until IDE picks up regenerated Prisma types)
    const sub = await (prisma as any).pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        entityId: id,
        entityRole: role,
        auth,
        p256dh,
      },
      create: {
        entityId: id,
        entityRole: role,
        endpoint: subscription.endpoint,
        auth,
        p256dh,
      },
    });

    return res.status(200).json({ success: true, message: 'Push subscription registered', subscription: sub });
  } catch (error: any) {
    console.error('Push subscribe error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}));

const app = express();

app.use(cors());
app.use(express.json());
app.use(router);

export default app;
