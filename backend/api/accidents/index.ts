import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import prisma from '../../config/db';
import { AccidentRepository } from '../../repositories/accidents';
import { UserRepository } from '../../repositories/users';
import { AlertRepository } from '../../repositories/alerts';
import { RouteRepository } from '../../repositories/routes';
import { MessageRepository } from '../../repositories/messages';
import { StorageService } from '../../services/storage';
import { RealtimeService } from '../../services/realtime';
import { MapService } from '../../services/maps';
import { withAuth, AuthenticatedRequest } from '../../middleware/auth';
import { NotificationService } from '../../services/notifications';

import { redis } from '../../services/redis';
import { runPhaseDispatch } from '../../services/dispatch';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/quicktime',
      'video/mpeg',
      'text/plain' // Required for the smoke test evidence upload which sends a plain text file!
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images, videos, and test plain text files are allowed.'));
    }
  }
});

const RESPONDER_ROLES = ['hospital', 'ambulance', 'police_station', 'policeman', 'mechanic', 'volunteer', 'fire_department', 'insurance'];

// ─── Trigger Accident ────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/accidents/trigger:
 *   post:
 *     tags: [Accidents]
 *     summary: Trigger / report an accident
 *     description: Manually reports an emergency accident. Triggers the full dispatch pipeline (alerts, route assignment, Inngest workflow). Deduplicates within 5 minutes.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude: { type: number, example: 16.5062 }
 *               longitude: { type: number, example: 80.648 }
 *               severity: { type: string, enum: [low, medium, high, critical], example: high }
 *               description: { type: string, example: Head-on collision on NH-16 bypass }
 *               speed_at_impact: { type: number, example: 72.5 }
 *     responses:
 *       200:
 *         description: Accident logged and dispatch pipeline initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 accident:
 *                   $ref: '#/components/schemas/Accident'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/api/accidents/trigger', withAuth(async (req: AuthenticatedRequest, res) => {
  const data = req.body || {};
  const latVal = data.latitude !== undefined ? data.latitude : data.lat;
  const lngVal = data.longitude !== undefined ? data.longitude : data.lng;

  if (latVal === undefined || lngVal === undefined) {
    return res.status(400).json({ success: false, message: 'Latitude and longitude coordinates are required.' });
  }

  const lat = parseFloat(latVal);
  const lng = parseFloat(lngVal);

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ success: false, message: 'Latitude and longitude must be valid numeric values.' });
  }

  if (lat < -90 || lat > 90) {
    return res.status(400).json({ success: false, message: 'Latitude must be between -90 and 90 degrees.' });
  }

  if (lng < -180 || lng > 180) {
    return res.status(400).json({ success: false, message: 'Longitude must be between -180 and 180 degrees.' });
  }

  const severity = data.severity || 'medium';
  const description = data.description || 'Manual emergency trigger.';
  const speedAtImpact = data.speed_at_impact !== undefined ? parseFloat(data.speed_at_impact) : parseFloat(data.speedAtImpact || 0);

  const userId = req.entityId || '';

  try {
    const code = 'ACC-' + Math.floor(100000 + Math.random() * 900000).toString();

    // 30-Second Redis Deduplication
    const dedupFingerprint = `dedup:trigger:${userId}:${severity}:${lat.toFixed(4)}:${lng.toFixed(4)}`;
    try {
      const existingAccidentId = await redis.get(dedupFingerprint);
      if (existingAccidentId) {
        const existingAcc = await AccidentRepository.findById(existingAccidentId);
        if (existingAcc) {
          console.log(`[Deduplication] Merging duplicate trigger for user ${userId}. Accident ID: ${existingAccidentId}`);
          return res.status(200).json({
            success: true,
            message: 'Active accident already logged (deduplicated).',
            accident: existingAcc,
          });
        }
      }
    } catch (redisErr: any) {
      console.warn('Deduplication check failed, bypassing:', redisErr.message);
    }

    // Check for active accident in the last 5 minutes
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    const existing = await AccidentRepository.findActiveInLast5Minutes(userId, fiveMinsAgo);

    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Active accident already logged in last 5 minutes.',
        accident: existing,
      });
    }

    const defaultLock = {
      ambulance: null,
      police: null,
      hospital: null,
      mechanic: null,
      insurance: null
    };

    let deviceId = data.device_id || data.deviceId || null;
    let vehicleNumber = req.user.vehicleNumber || 'N/A';
    let vehicleType = req.user.vehicleType || 'Car';

    if (deviceId) {
      const dev = await prisma.device.findFirst({
        where: {
          OR: [
            { id: deviceId },
            { deviceId: String(deviceId) }
          ]
        }
      });
      if (dev) {
        deviceId = dev.id; // use internal UUID
        const veh = await prisma.vehicleInformation.findFirst({
          where: { deviceId: dev.id }
        });
        if (veh) {
          vehicleNumber = veh.vehicleNumber;
          vehicleType = veh.vehicleType;
        }
      }
    }

    const newAcc = await AccidentRepository.create({
      accidentCode: code,
      userId,
      deviceId,
      vehicleNumber,
      vehicleType,
      latitude: lat,
      longitude: lng,
      severity,
      description,
      speedAtImpact,
      locationAddress: `${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E`,
      status: 'active',
      acceptedByRole: defaultLock,
    });

    // Save ID to Redis Deduplication Cache with 30 seconds TTL
    try {
      await redis.set(dedupFingerprint, newAcc.id, 'EX', 30);
    } catch (redisErr: any) {
      console.warn('Failed to cache deduplication fingerprint:', redisErr.message);
    }

    // Create PanicAlertAuditLog
    try {
      await (prisma as any).panicAlertAuditLog.create({
        data: {
          accidentId: newAcc.id,
          creationTime: new Date(),
        }
      });
    } catch (logErr: any) {
      console.warn('Failed to create PanicAlertAuditLog:', logErr.message);
    }

    // Log status change
    await AccidentRepository.createStatusLog({
      accidentId: newAcc.id,
      status: 'active',
      notes: 'Accident reported via citizen mobile app.',
    });

    // Broadcast new accident via EMQX MQTT to all subscribed responder dashboards
    const socketPayload = {
      accidentId: newAcc.id,
      code: newAcc.accidentCode,
      lat: newAcc.latitude,
      lng: newAcc.longitude,
      severity: newAcc.severity,
      userId: newAcc.userId,
      timestamp: new Date().toISOString(),
    };
    await RealtimeService.trigger('accidents', 'new', socketPayload);
    await RealtimeService.trigger('accidents', 'accident:new', socketPayload);

    // Run Phase 1 dispatch immediately (blocking under 1-2s to guarantee delivery on serverless)
    try {
      console.log(`[Immediate Dispatch] Running Phase 1 dispatch for accident ${newAcc.id}...`);
      await runPhaseDispatch(newAcc.id, 8, 1);
    } catch (dispatchErr: any) {
      console.error('[Immediate Dispatch Error] Failed to run Phase 1 dispatch:', dispatchErr.message);
    }

    // Return immediately — EMQX MQTT already broadcast the alert above.
    res.status(201).json({
      success: true,
      accident: newAcc,
    });

  } catch (error: any) {
    console.error('Trigger Accident Error:', error);
    // Only send error if response hasn't been sent yet
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}, ['user', 'volunteer', 'fire_department']));

// ─── Retrieve Accidents (My Accidents) ────────────────────────────────────────

/**
 * @swagger
 * /api/accidents/my:
 *   get:
 *     tags: [Accidents]
 *     summary: Get my accident history
 *     description: Returns all accidents associated with the authenticated user's account.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's accidents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 accidents:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Accident'
 */
router.get('/api/accidents/my', withAuth(async (req: AuthenticatedRequest, res) => {
  const role = req.entityRole || 'user';
  const id = req.entityId || '';

  try {
    if (role === 'admin' || role === 'superadmin') {
      const accidents = await AccidentRepository.findAll();
      return res.status(200).json({ success: true, accidents });
    }

    if (RESPONDER_ROLES.includes(role)) {
      // Find alerts sent to this responder
      const alerts = await AlertRepository.findByRecipient(id, role);
      const accidentIds = alerts.map((a: any) => a.accidentId);

      const accidents = await prisma.accident.findMany({
        where: { id: { in: accidentIds } },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({ success: true, accidents });
    }

    // Citizen
    const accidents = await AccidentRepository.findByUserId(id);
    return res.status(200).json({ success: true, accidents });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

/**
 * @swagger
 * /api/accidents:
 *   get:
 *     tags: [Accidents]
 *     summary: List all accidents
 *     description: |
 *       Returns all accidents in the system.
 *
 *       **Auto-expiry**: Before returning results, this endpoint automatically marks any
 *       active/in-progress incidents that were created more than **24 hours ago** as `expired`.
 *       Expired incidents are broadcast via socket to remove their markers from all connected maps.
 *
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [active, dispatched, responded, resolved, cancelled, false_alarm, expired] }
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Accidents list (stale incidents auto-expired before response)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 accidents:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Accident'
 */
router.get('/api/accidents', withAuth(async (req: AuthenticatedRequest, res) => {
  try {
    // ── Auto-expire active incidents older than 24 hours ──────────────────────
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeStatuses = ['active', 'alert_created', 'alert_broadcasted', 'accepted', 'dispatched',
      'responded', 'start_response', 'en_route', 'near_incident', 'arrived',
      'victim_located', 'assistance_in_progress', 'victim_transported'];

    try {
      const staleAccidents = await prisma.accident.findMany({
        where: {
          status: { in: activeStatuses },
          createdAt: { lt: cutoff24h },
        },
        select: { id: true, accidentCode: true },
      });

      if (staleAccidents.length > 0) {
        await Promise.allSettled(
          staleAccidents.map(async (acc) => {
            await AccidentRepository.update(acc.id, { status: 'expired', resolvedAt: new Date() });
            await AccidentRepository.createStatusLog({
              accidentId: acc.id,
              status: 'expired',
              notes: 'Alert auto-expired: no resolution after 24 hours.',
            });
            // Broadcast removal to all connected clients
            await RealtimeService.trigger('accidents', 'status_change', {
              accidentId: acc.id,
              code: acc.accidentCode,
              status: 'expired',
              timestamp: new Date().toISOString(),
            });
          })
        );
        console.log(`[Cleanup] Auto-expired ${staleAccidents.length} stale incident(s).`);
      }
    } catch (cleanupErr: any) {
      console.warn('[Cleanup] Auto-expire step failed (non-fatal):', cleanupErr.message);
    }
    // ─────────────────────────────────────────────────────────────────────────

    const accidents = await AccidentRepository.findAll();
    return res.status(200).json({ success: true, accidents });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

// ─── Accident Actions (Cancel, False Alarm, Resolve, Status Updates) ──────────

async function updateAccidentStatus(accidentId: string, status: string, responderId?: string, responderType?: string, notes?: string) {
  const accident = await AccidentRepository.update(accidentId, {
    status,
    resolvedAt: ['resolved', 'closed', 'cancelled', 'false_alarm'].includes(status) ? new Date() : null,
    responderId: responderId || null,
    responderType: responderType || null,
  });

  if (['resolved', 'closed', 'cancelled', 'false_alarm'].includes(status)) {
    try {
      await (prisma as any).panicAlertAuditLog.update({
        where: { accidentId },
        data: { completionTime: new Date() }
      });
    } catch (logErr: any) {
      console.warn('Failed to update PanicAlertAuditLog completionTime:', logErr.message);
    }
  }

  const log = await AccidentRepository.createStatusLog({
    accidentId,
    status,
    responderId: responderId || null,
    responderType: responderType || null,
    notes,
  });

  const payload = {
    accidentId,
    status,
    responderId,
    responderType,
    notes,
    timestamp: new Date().toISOString(),
  };

  await RealtimeService.trigger(`accident-${accidentId}`, 'status_change', payload);
  await RealtimeService.trigger('accidents', 'status_change', payload);

  if (accident && accident.userId) {
    let title = 'Emergency Update';
    let body = `Your incident status has been updated to: ${status.replace('_', ' ').toUpperCase()}`;
    
    if (status === 'responded') {
      title = '🤝 Savior Dispatched';
      body = 'A responder has accepted your SOS alert and is en route.';
    } else if (status === 'arrived') {
      title = '🚑 Savior Arrived';
      body = 'A responder has arrived at your accident location.';
    } else if (status === 'resolved' || status === 'closed') {
      title = '✅ Emergency Resolved';
      body = 'Your emergency situation has been marked as resolved. Glad you are safe!';
    } else if (status === 'cancelled') {
      title = '❌ Emergency Cancelled';
      body = 'Your emergency incident report has been cancelled.';
    }

    await NotificationService.sendBrowserPush(
      accident.userId,
      title,
      body,
      { accidentId: accident.id, status }
    ).catch(err => console.error('Failed to send status update push notification:', err));
  }

  return { accident, log };
}

/**
 * @swagger
 * /api/accidents/{id}/cancel:
 *   post:
 *     tags: [Accidents]
 *     summary: Cancel an accident
 *     description: Cancels an active accident report.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         description: Accident ID
 *     responses:
 *       200:
 *         description: Accident cancelled
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.post('/api/accidents/:id/cancel', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { notes } = req.body || {};
  try {
    if (id.startsWith('optimistic-id-')) {
      console.log(`[Cancel] Intercepted optimistic accident ID: ${id}. Returning fast-cancellation success.`);
      return res.status(200).json({
        success: true,
        message: 'Accident cancelled successfully',
        accident: { id, status: 'cancelled' }
      });
    }

    const exists = await prisma.accident.findUnique({ where: { id } });
    if (!exists) {
      return res.status(404).json({ success: false, message: 'Accident not found.' });
    }

    const { accident } = await updateAccidentStatus(id, 'cancelled', req.entityId, req.entityRole, notes || 'Accident cancelled by user.');
    return res.status(200).json({ success: true, message: 'Accident cancelled successfully', accident });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

/**
 * @swagger
 * /api/accidents/{id}/false-alarm:
 *   post:
 *     tags: [Accidents]
 *     summary: Mark accident as false alarm
 *     description: Marks a reported accident as a false alarm and closes it.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Marked as false alarm
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.post('/api/accidents/:id/false-alarm', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { notes } = req.body || {};
  try {
    if (id.startsWith('optimistic-id-')) {
      console.log(`[False Alarm] Intercepted optimistic accident ID: ${id}. Returning fast-false-alarm success.`);
      return res.status(200).json({
        success: true,
        message: 'Accident marked as false alarm',
        accident: { id, status: 'false_alarm' }
      });
    }

    const exists = await prisma.accident.findUnique({ where: { id } });
    if (!exists) {
      return res.status(404).json({ success: false, message: 'Accident not found.' });
    }

    const { accident } = await updateAccidentStatus(id, 'false_alarm', req.entityId, req.entityRole, notes || 'Accident marked as false alarm.');
    return res.status(200).json({ success: true, message: 'Accident marked as false alarm', accident });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

/**
 * @swagger
 * /api/accidents/{id}/resolve:
 *   post:
 *     tags: [Accidents]
 *     summary: Resolve an accident
 *     description: Marks an accident as resolved and closes the dispatch pipeline.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes: { type: string, example: Scene cleared, patient transported }
 *     responses:
 *       200:
 *         description: Accident resolved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.post('/api/accidents/:id/resolve', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { notes } = req.body || {};
  try {
    const { accident } = await updateAccidentStatus(id, 'resolved', req.entityId, req.entityRole, notes || 'Accident resolved successfully.');
    
    // Complete active routes
    await RouteRepository.completeActiveRoutes(id);

    const activeRoutes = await RouteRepository.findByAccidentId(id);
    for (const r of activeRoutes) {
      await RealtimeService.trigger(`route-${r.id}`, 'completed', {
        routeId: r.id,
        accidentId: id,
        responderId: req.entityId,
        responderType: req.entityRole,
      });
    }

    return res.status(200).json({ success: true, message: 'Accident resolved', accident });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

/**
 * @swagger
 * /api/accidents/{id}/status:
 *   post:
 *     tags: [Accidents]
 *     summary: Update accident dispatch status
 *     description: Allows responders and admins to update the incident status.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [active, dispatched, responded, resolved], example: responded }
 *               notes: { type: string, example: Ambulance en route }
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.post('/api/accidents/:id/status', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { status, notes, responderId, responderType } = req.body || {};
  if (!status) return res.status(400).json({ success: false, message: 'Status is required' });

  try {
    const { accident } = await updateAccidentStatus(
      id,
      status,
      responderId || req.entityId,
      responderType || req.entityRole,
      notes || `Status updated to ${status}.`
    );

    if (['resolved', 'closed'].includes(status)) {
      await RouteRepository.completeActiveRoutes(id);
    }

    return res.status(200).json({ success: true, accident });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

/**
 * @swagger
 * /api/accidents/{id}/status-logs:
 *   get:
 *     tags: [Accidents]
 *     summary: Get accident status history
 *     description: Returns a chronological log of all status changes for an accident.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Status change log
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 logs: { type: array, items: { type: object } }
 */
router.get('/api/accidents/:id/status-logs', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const logs = await AccidentRepository.findStatusLogs(id);
    return res.status(200).json({ success: true, logs });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

// ─── Retrieve Details (For Dispatch Panel) ─────────────────────────────────────

/**
 * @swagger
 * /api/accidents/{id}:
 *   get:
 *     tags: [Accidents]
 *     summary: Get accident by ID
 *     description: Returns full accident details including telemetry, status, and responder information.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Accident detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 accident:
 *                   $ref: '#/components/schemas/Accident'
 *       404:
 *         description: Accident not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/api/accidents/:id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const accident = await AccidentRepository.findById(id);
    if (!accident) return res.status(404).json({ success: false, message: 'Accident not found' });
    return res.status(200).json({ success: true, accident });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

/**
 * @swagger
 * /api/accidents/{id}/details:
 *   get:
 *     tags: [Accidents]
 *     summary: Get extended accident details
 *     description: Returns enriched accident data including linked alerts, routes, chat messages, and evidence files.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Extended accident data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 accident: { $ref: '#/components/schemas/Accident' }
 *                 alerts: { type: array, items: { $ref: '#/components/schemas/Alert' } }
 */
router.get('/api/accidents/:id/details', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const accident = await AccidentRepository.findById(id);
    if (!accident) return res.status(404).json({ success: false, message: 'Accident not found' });

    const [victim, alerts, logs, report] = await Promise.all([
      UserRepository.findUserById(accident.userId || ''),
      AlertRepository.findByAccidentId(id),
      AccidentRepository.findStatusLogs(id),
      AccidentRepository.findReport(id),
    ]);

    let device = null;
    if (accident.deviceId) {
      device = await prisma.device.findFirst({
        where: {
          OR: [
            { id: accident.deviceId },
            { deviceId: accident.deviceId }
          ]
        }
      });
    }
    if (!device && accident.userId) {
      device = await prisma.device.findFirst({
        where: { ownerId: accident.userId, isLinked: true }
      });
    }

    const responderPromises = alerts.map(async (a) => {
      let details: any = null;
      if (a.recipientType === 'hospital') {
        details = await prisma.hospital.findUnique({ where: { id: a.recipientId } });
      } else if (a.recipientType === 'ambulance') {
        details = await prisma.ambulanceDriver.findUnique({ where: { id: a.recipientId } });
      } else if (a.recipientType === 'police_station') {
        details = await prisma.policeStation.findUnique({ where: { id: a.recipientId } });
      } else if (a.recipientType === 'policeman') {
        details = await prisma.policeman.findUnique({ where: { id: a.recipientId } });
      } else if (a.recipientType === 'mechanic') {
        details = await prisma.mechanic.findUnique({ where: { id: a.recipientId } });
      } else if (['volunteer', 'fire_department'].includes(a.recipientType)) {
        details = await UserRepository.findUserById(a.recipientId);
      }

      if (details) {
        return {
          alertId: a.id,
          recipientId: a.recipientId,
          type: a.recipientType,
          name: details.name || details.fullName,
          mobile: details.mobile,
          status: a.status,
          distanceKm: a.distanceKm,
          etaMinutes: a.etaMinutes,
          latitude: details.latitude || details.lastLocationLat,
          longitude: details.longitude || details.lastLocationLng,
        };
      }
      return null;
    });

    const respondersWithNulls = await Promise.all(responderPromises);
    const responders = respondersWithNulls.filter((r) => r !== null);

    const resources = await AlertRepository.findResourcesByAssignment(id);

    return res.status(200).json({
      success: true,
      accident,
      victim: victim ? {
        id: victim.id,
        fullName: victim.fullName,
        mobile: victim.mobile,
        bloodGroup: victim.bloodGroup,
        vehicleNumber: victim.vehicleNumber,
        vehicleType: victim.vehicleType,
      } : null,
      device: device ? {
        deviceId: device.deviceId,
        status: device.status,
        batteryLevel: device.batteryLevel,
      } : null,
      responders,
      resources,
      timeline: logs,
      report,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

// ─── File Uploads (Evidence) ──────────────────────────────────────────────────

router.post(
  '/api/accidents/:id/upload-evidence',
  withAuth(async (req: AuthenticatedRequest & { file?: Express.Multer.File }, res) => {
    upload.single('file')(req as any, res as any, async (err: any) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }

      const { id } = req.params;
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file part' });
      }

      try {
        const rawExtension = req.file.originalname.split('.').pop() || 'jpg';
        const extension = rawExtension.replace(/[^a-zA-Z0-9]/g, '');
        const filename = `${id}_${crypto.randomBytes(4).toString('hex')}.${extension}`;

        const fileUrl = await StorageService.uploadEvidence(req.file.buffer, filename, req.file.mimetype);

        return res.status(200).json({ success: true, url: fileUrl });
      } catch (error: any) {
        console.error('Evidence Upload Error:', error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });
  })
);



// ─── Incident Chat Operations ─────────────────────────────────────────────────

/**
 * @swagger
 * /api/accidents/{id}/chat:
 *   get:
 *     tags: [Accidents]
 *     summary: Get accident coordination chat
 *     description: Returns all chat messages in the accident's coordination channel.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chat messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 messages: { type: array, items: { type: object } }
 */
router.get('/api/accidents/:id/chat', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const messages = await MessageRepository.findChatMessages(id);
    return res.status(200).json({ success: true, messages });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

/**
 * @swagger
 * /api/accidents/{id}/chat:
 *   post:
 *     tags: [Accidents]
 *     summary: Send chat message to accident channel
 *     description: Sends a coordination message to the accident's real-time chat channel via Pusher.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string, example: Ambulance ETA 5 minutes }
 *     responses:
 *       200:
 *         description: Message sent
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.post('/api/accidents/:id/chat', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { content, messageType } = req.body || {};
  if (!content) return res.status(400).json({ success: false, message: 'Content is required' });

  try {
    let senderName = 'Responder';
    const role = req.entityRole || '';

    if (['user', 'volunteer', 'fire_department', 'emergency_personnel'].includes(role)) {
      const usr = await UserRepository.findUserById(req.entityId || '');
      if (usr) senderName = usr.fullName;
    } else if (role === 'policeman') {
      const cop = await prisma.policeman.findUnique({ where: { id: req.entityId } });
      if (cop) senderName = `Officer ${cop.name}`;
    } else if (role === 'ambulance') {
      const amb = await prisma.ambulanceDriver.findUnique({ where: { id: req.entityId } });
      if (amb) senderName = `Ambulance ${amb.name}`;
    } else if (role === 'hospital') {
      const hosp = await prisma.hospital.findUnique({ where: { id: req.entityId } });
      if (hosp) senderName = hosp.name;
    } else if (['admin', 'superadmin'].includes(role)) {
      senderName = 'Control Room Admin';
    }

    const msg = await MessageRepository.createChatMessage({
      accidentId: id,
      senderId: req.entityId || '',
      senderType: role,
      senderName,
      messageType: messageType || 'text',
      content,
    });

    // Broadcast chat message via Pusher
    await RealtimeService.trigger(`accident-${id}`, 'chat', msg);

    return res.status(200).json({
      success: true,
      message: msg,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

// ─── Smart Recommendation Engine ──────────────────────────────────────────────

/**
 * @swagger
 * /api/accidents/{id}/recommend-responders:
 *   get:
 *     tags: [Accidents]
 *     summary: Get recommended responders for an accident
 *     description: Returns a scored and sorted list of available responders (hospitals, ambulances, police) near the accident location.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Recommended responders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 hospitals: { type: array, items: { $ref: '#/components/schemas/Hospital' } }
 *                 ambulances: { type: array, items: { type: object } }
 *                 police: { type: array, items: { type: object } }
 */
router.get('/api/accidents/:id/recommend-responders', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const accident = await AccidentRepository.findById(id);
    if (!accident) return res.status(404).json({ success: false, message: 'Accident not found' });

    const accLat = accident.latitude;
    const accLng = accident.longitude;
    const severity = accident.severity || 'medium';

    const [ambs, pms, users, activeRoutes] = await Promise.all([
      prisma.ambulanceDriver.findMany({ where: { isActive: true, isAvailable: true } }),
      prisma.policeman.findMany({ where: { isActive: true, isAvailable: true } }),
      prisma.user.findMany({
        where: { isActive: true, isAvailable: true, role: { in: ['volunteer', 'fire_department'] } },
      }),
      prisma.route.findMany({
        where: { status: 'active' },
        select: { fromEntityId: true }
      }),
    ]);

    const entitiesWithActiveRoutes = new Set(activeRoutes.map(r => r.fromEntityId));
    const recommendations: any[] = [];

    function scoreResponder(entityId: string, entityRole: string, entityName: string, entityMobile: string, eLat: number, eLng: number) {
      const dist = MapService.haversineDistance(accLat, accLng, eLat, eLng);
      if (dist > 15.0) return;

      const distanceScore = Math.max(0, 100 - Math.round(dist * 6));
      let suitabilityBonus = 0;

      if (['critical', 'high'].includes(severity)) {
        if (entityRole === 'ambulance') suitabilityBonus = 80;
        else if (entityRole === 'policeman') suitabilityBonus = 50;
        else if (entityRole === 'volunteer') suitabilityBonus = 20;
        else if (entityRole === 'fire_department') suitabilityBonus = 60;
      } else {
        if (entityRole === 'volunteer') suitabilityBonus = 80;
        else if (entityRole === 'policeman') suitabilityBonus = 50;
        else if (entityRole === 'mechanic') suitabilityBonus = 40;
      }

      const hasActiveRoute = entitiesWithActiveRoutes.has(entityId);
      const workloadBonus = !hasActiveRoute ? 30 : -40;
      const totalScore = distanceScore + suitabilityBonus + workloadBonus;

      recommendations.push({
        id: entityId,
        role: entityRole,
        name: entityName,
        mobile: entityMobile,
        distance_km: parseFloat(dist.toFixed(2)),
        score: totalScore,
        eta_minutes: MapService.estimateETA(dist, 40),
      });
    }

    // Evaluate Ambulances
    for (const a of ambs) {
      if (a.latitude !== null && a.longitude !== null) {
        scoreResponder(a.id, 'ambulance', a.name, a.mobile, a.latitude, a.longitude);
      }
    }

    // Evaluate Police
    for (const p of pms) {
      if (p.latitude !== null && p.longitude !== null) {
        scoreResponder(p.id, 'policeman', p.name, p.mobile, p.latitude, p.longitude);
      }
    }

    // Evaluate Volunteers & Fire Dept
    for (const u of users) {
      if (u.lastLocationLat !== null && u.lastLocationLng !== null) {
        scoreResponder(u.id, u.role, u.fullName, u.mobile, u.lastLocationLat, u.lastLocationLng);
      }
    }

    recommendations.sort((a, b) => b.score - a.score);

    return res.status(200).json({
      success: true,
      recommendations: recommendations.slice(0, 5),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

// ─── Manual Responder Assignment ──────────────────────────────────────────────

/**
 * @swagger
 * /api/accidents/{id}/assign:
 *   post:
 *     tags: [Accidents]
 *     summary: Manually assign a responder to an accident
 *     description: Dispatches a specific responder to the accident and creates the navigation route.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [responder_id, responder_type]
 *             properties:
 *               responder_id: { type: string }
 *               responder_type: { type: string, example: hospital }
 *     responses:
 *       200:
 *         description: Responder assigned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.post('/api/accidents/:id/assign', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { responderId, responderType } = req.body || {};

  if (!responderId || !responderType) {
    return res.status(400).json({ success: false, message: 'responderId and responderType are required' });
  }

  try {
    const accident = await AccidentRepository.findById(id);
    if (!accident) return res.status(404).json({ success: false, message: 'Accident not found' });

    // Check if there is an existing alert
    const existingAlert = await AlertRepository.findAlertByAccidentAndRecipient(id, responderId, responderType);

    if (existingAlert) {
      return res.status(200).json({
        success: true,
        message: 'Responder has already been dispatched/notified',
        alert: existingAlert,
      });
    }

    let resLat: number | null = null;
    let resLng: number | null = null;
    let recipientMobile = '';
    let recipientName = 'Responder';
    let entity: any = null;

    if (['user', 'volunteer', 'fire_department', 'emergency_personnel'].includes(responderType)) {
      entity = await UserRepository.findUserById(responderId);
      if (entity) {
        resLat = entity.lastLocationLat;
        resLng = entity.lastLocationLng;
        recipientMobile = entity.mobile;
        recipientName = entity.fullName;
      }
    } else if (responderType === 'hospital') {
      entity = await prisma.hospital.findUnique({ where: { id: responderId } });
      if (entity) {
        resLat = entity.latitude;
        resLng = entity.longitude;
        recipientMobile = entity.mobile;
        recipientName = entity.name;
      }
    } else if (responderType === 'ambulance') {
      entity = await prisma.ambulanceDriver.findUnique({ where: { id: responderId } });
      if (entity) {
        resLat = entity.latitude;
        resLng = entity.longitude;
        recipientMobile = entity.mobile;
        recipientName = entity.name;
      }
    } else if (responderType === 'policeman') {
      entity = await prisma.policeman.findUnique({ where: { id: responderId } });
      if (entity) {
        resLat = entity.latitude;
        resLng = entity.longitude;
        recipientMobile = entity.mobile;
        recipientName = entity.name;
      }
    }

    let distKm = 0.0;
    if (resLat !== null && resLng !== null) {
      distKm = MapService.haversineDistance(accident.latitude, accident.longitude, resLat, resLng);
    }

    const etaMin = MapService.estimateETA(distKm, 40);

    const alert = await AlertRepository.create({
      accidentId: accident.id,
      recipientId: responderId,
      recipientType: responderType,
      message: `🚨 ASSIGNED BY CONTROL ROOM: Emergency call ${accident.accidentCode}. Distance: ${distKm.toFixed(2)}km | ETA: ${etaMin}min. Please accept immediately.`,
      phase: 1,
      distanceKm: distKm,
      etaMinutes: etaMin,
      status: 'sent',
    });

    const user = await UserRepository.findUserById(accident.userId || '');
    const userJson = user ? {
      id: user.id,
      fullName: user.fullName,
      mobile: user.mobile,
      bloodGroup: user.bloodGroup,
    } : null;

    const socketPayload = {
      type: 'accident_alert',
      alert,
      accident,
      user: userJson,
      victim: userJson,
    };

    // Emit alerts to individual responder channel via Pusher
    await RealtimeService.trigger(`entity-${responderId}`, 'alert', socketPayload);
    await RealtimeService.trigger(`entity-${responderId}`, 'alert:new', { alert, accident });

    // In a real serverless app, we trigger FCM push notifications here if credentials exist
    console.log(`🔥 [FCM Push Assign] To token: ${entity?.fcmToken || 'None'}`);

    return res.status(200).json({
      success: true,
      message: 'Responder successfully dispatched',
      alert,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

const app = express();
app.use(cors());
app.use(express.json());
app.use(router);

export default app;
