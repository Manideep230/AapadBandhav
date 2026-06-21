import express from 'express';
import { createExpressApp } from '../../utils/expressApp';
import prisma from '../../config/db';
import { AlertRepository } from '../../repositories/alerts';
import { AccidentRepository } from '../../repositories/accidents';
import { RouteRepository } from '../../repositories/routes';
import { UserRepository } from '../../repositories/users';
import { RealtimeService } from '../../services/realtime';
import { MapService } from '../../services/maps';
import { NotificationService } from '../../services/notifications';
import { withAuth, AuthenticatedRequest } from '../../middleware/auth';
import { SMSService } from '../../services/sms';

const router = express.Router();

async function enrichAlert(alert: any) {
  if (!alert) return null;
  const accident = await prisma.accident.findUnique({
    where: { id: alert.accidentId },
  });

  let victim = null;
  let device = null;
  let vehicle = null;
  let owner = null;

  if (accident) {
    if (accident.userId) {
      victim = await prisma.user.findUnique({
        where: { id: accident.userId },
      });
    }

    if (accident.deviceId) {
      device = await prisma.device.findFirst({
        where: {
          OR: [
            { id: accident.deviceId },
            { deviceId: accident.deviceId }
          ]
        }
      });
      if (device) {
        vehicle = await prisma.vehicleInformation.findFirst({
          where: { deviceId: device.id }
        });
      }
    }

    if (!device && accident.userId) {
      device = await prisma.device.findFirst({
        where: { ownerId: accident.userId, isLinked: true },
      });
      if (device) {
        vehicle = await prisma.vehicleInformation.findFirst({
          where: { deviceId: device.id }
        });
      }
    }

    if (!vehicle && accident.userId) {
      vehicle = await prisma.vehicleInformation.findFirst({
        where: { userId: accident.userId },
      });
    }

    if (device && device.ownerId) {
      owner = await prisma.user.findUnique({
        where: { id: device.ownerId },
      });
    }
  }

  return {
    ...alert,
    accident: accident ? {
      ...accident,
      vehicle_number: accident.vehicleNumber,
      vehicle_type: accident.vehicleType,
      location_address: accident.locationAddress,
    } : null,
    victim: victim ? {
      id: victim.id,
      full_name: victim.fullName,
      mobile: victim.mobile,
      blood_group: victim.bloodGroup,
      vehicle_number: victim.vehicleNumber,
      vehicle_type: victim.vehicleType,
      uniqueId: victim.uniqueId,
      unique_id: victim.uniqueId,
    } : null,
    user: victim ? {
      id: victim.id,
      full_name: victim.fullName,
      mobile: victim.mobile,
      blood_group: victim.bloodGroup,
      vehicle_number: victim.vehicleNumber,
      vehicle_type: victim.vehicleType,
      uniqueId: victim.uniqueId,
      unique_id: victim.uniqueId,
    } : null,
    device: device ? {
      id: device.id,
      deviceId: device.deviceId,
      status: device.status,
      batteryLevel: device.batteryLevel,
      isActive: device.isActive,
    } : null,
    vehicle: vehicle ? {
      id: vehicle.id,
      vehicleType: vehicle.vehicleType,
      vehicleNumber: vehicle.vehicleNumber,
      vehicleModel: vehicle.vehicleModel,
      manufacturer: vehicle.manufacturer,
      year: vehicle.year,
    } : null,
    vehicleOwner: owner ? {
      id: owner.id,
      full_name: owner.fullName,
      mobile: owner.mobile,
    } : null,
    gps_coordinates: accident ? {
      latitude: accident.latitude,
      longitude: accident.longitude,
    } : null,
    alert_timestamp: accident ? accident.createdAt.toISOString() : null,
  };
}

const ALERTS_CHANNELS = [
  '/api/alerts/my-alerts',
  '/api/hospitals/alerts',
  '/api/ambulances/alerts',
  '/api/police/station/alerts',
  '/api/mechanics/alerts',
  '/api/fire/alerts',
  '/api/volunteer/alerts',
  '/api/my/alerts',
];

/**
 * @swagger
 * /api/alerts/my-alerts:
 *   get:
 *     tags: [Alerts]
 *     summary: Get my emergency alerts
 *     description: |
 *       Returns all dispatch alerts sent to the authenticated entity. Works for all responder types:
 *       - `hospital` → `/api/hospitals/alerts`
 *       - `ambulance` → `/api/ambulances/alerts`
 *       - `police_station` → `/api/police/station/alerts`
 *       - `mechanic` → `/api/mechanics/alerts`
 *       - `fire_department` → `/api/fire/alerts`
 *       - `volunteer` → `/api/volunteer/alerts`
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of alerts for this entity
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 alerts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Alert'
 */
router.get(ALERTS_CHANNELS, withAuth(async (req: AuthenticatedRequest, res) => {
  const role = req.entityRole || 'user';
  const id = req.entityId || '';
  try {
    const alerts = await AlertRepository.findByRecipient(id, role);
    const enrichedAlerts = await Promise.all(alerts.map(a => enrichAlert(a)));
    return res.status(200).json({ success: true, alerts: enrichedAlerts });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

/**
 * @swagger
 * /api/alerts/{id}:
 *   get:
 *     tags: [Alerts]
 *     summary: Get alert by ID
 *     description: Returns full details of a specific alert.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Alert detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 alert: { $ref: '#/components/schemas/Alert' }
 *       404:
 *         description: Alert not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/api/alerts/:id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const alert = await AlertRepository.findById(id);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    const enriched = await enrichAlert(alert);
    return res.status(200).json({ success: true, alert: enriched });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

/**
 * @swagger
 * /api/alerts/accident/{accident_id}:
 *   get:
 *     tags: [Alerts]
 *     summary: Get all alerts for an accident
 *     description: Returns all dispatch alerts sent to responders for a specific accident.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: accident_id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Alerts for the accident
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 alerts: { type: array, items: { $ref: '#/components/schemas/Alert' } }
 */
router.get('/api/alerts/accident/:accident_id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { accident_id } = req.params;
  try {
    const alerts = await AlertRepository.findByAccidentId(accident_id);
    const enrichedAlerts = await Promise.all(alerts.map(a => enrichAlert(a)));
    return res.status(200).json({ success: true, alerts: enrichedAlerts });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

// ─── Responder Accept/Reject alert ─────────────────────────────────────────────

const RESPOND_CHANNELS = [
  '/api/alerts/:id/respond',
  '/api/hospitals/alerts/:id/respond',
  '/api/ambulances/alerts/:id/respond',
  '/api/police/station/alerts/:id/respond',
  '/api/mechanics/alerts/:id/respond',
  '/api/fire/alerts/:id/respond',
  '/api/volunteer/alerts/:id/respond',
];

/**
 * @swagger
 * /api/alerts/{id}/respond:
 *   post:
 *     tags: [Alerts]
 *     summary: Respond to an emergency alert
 *     description: |
 *       Accepts or rejects a dispatch alert. On acceptance:
 *       - Creates a navigation route from responder to accident location
 *       - Updates accident status to 'dispatched'
 *       - Broadcasts via Pusher to all accident subscribers
 *
 *       Available on all role-specific paths: `/api/hospitals/alerts/:id/respond`, `/api/ambulances/alerts/:id/respond`, etc.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         description: Alert ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [accepted, rejected]
 *                 example: accepted
 *               eta:
 *                 type: integer
 *                 description: Estimated time of arrival in minutes
 *                 example: 8
 *     responses:
 *       200:
 *         description: Response recorded, route created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 route: { $ref: '#/components/schemas/RouteNavigation' }
 *       404:
 *         description: Alert not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */

// ─── Haversine distance helper (returns km) ───────────────────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Get lat/lng for any responder role ──────────────────────────────────────
async function getResponderLocation(responderId: string, role: string): Promise<{ lat: number; lng: number } | null> {
  try {
    if (['user', 'volunteer', 'fire_department'].includes(role)) {
      const u = await prisma.user.findUnique({ where: { id: responderId } });
      if (u?.lastLocationLat && u?.lastLocationLng) return { lat: u.lastLocationLat, lng: u.lastLocationLng };
    } else if (role === 'hospital') {
      const h = await prisma.hospital.findUnique({ where: { id: responderId } });
      if (h) return { lat: h.latitude, lng: h.longitude };
    } else if (role === 'ambulance') {
      const a = await prisma.ambulanceDriver.findUnique({ where: { id: responderId } });
      if (a?.latitude && a?.longitude) return { lat: a.latitude, lng: a.longitude };
    } else if (role === 'policeman') {
      const p = await prisma.policeman.findUnique({ where: { id: responderId } });
      if (p?.latitude && p?.longitude) return { lat: p.latitude, lng: p.longitude };
    } else if (role === 'mechanic') {
      const m = await prisma.mechanic.findUnique({ where: { id: responderId } });
      if (m?.latitude && m?.longitude) return { lat: m.latitude, lng: m.longitude };
    }
  } catch (_) {}
  return null;
}
router.post(RESPOND_CHANNELS, withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { action, etaMinutes, eta_minutes, notes } = req.body || {};
  const eta = etaMinutes !== undefined ? parseInt(etaMinutes) : parseInt(eta_minutes || 0);

  if (!action || !['accepted', 'rejected'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Action must be accepted or rejected' });
  }

  const role = req.entityRole || 'user';
  const responderId = req.entityId || '';

  try {
    const alert = await AlertRepository.findById(id);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });

    // Update alert status
    const updatedAlert = await AlertRepository.update(id, {
      status: action,
      respondedAt: new Date(),
    });

    // Create acknowledgement
    const ack = await AlertRepository.createAcknowledgement({
      accidentId: alert.accidentId,
      alertId: alert.id,
      responderId,
      responderType: role,
      action,
      etaMinutes: eta || null,
      notes: notes || null,
    });

    const accident = await AccidentRepository.findById(alert.accidentId);
    if (!accident) return res.status(404).json({ success: false, message: 'Accident not found' });

    // Rangers (volunteer role) can always accept — unlimited multi-accept
    const isRanger = role === 'volunteer';

    if (action === 'accepted') {
      // One-per-role conflict check applies to all movable dispatch partners.
      // Rangers (volunteer) are excluded — they always multi-accept.
      const roleKeyMap: Record<string, string> = {
        ambulance: 'ambulance',
        police_station: 'police',
        policeman: 'police',
        hospital: 'hospital',
        mechanic: 'mechanic',
        insurance: 'insurance',
        fire_department: 'fire',  // Fire units: one per accident, same as ambulance
      };
      const roleKey = roleKeyMap[role];

      if (roleKey && !isRanger) {
        // ── Check if already accepted by another partner of same role ──────────
        const currentAccident = await prisma.accident.findUnique({ where: { id: alert.accidentId } });
        const existingResponderId: string | null = (currentAccident as any)?.acceptedByRole
          ? ((currentAccident as any).acceptedByRole as any)[roleKey]
          : null;

        if (existingResponderId && existingResponderId !== responderId) {
          // ── Distance-based reassignment check ──────────────────────────────
          const existingLoc = await getResponderLocation(existingResponderId, role);
          const newLoc = await getResponderLocation(responderId, role);

          let reassigned = false;
          if (existingLoc && newLoc) {
            const existingDist = haversineKm(existingLoc.lat, existingLoc.lng, accident.latitude, accident.longitude);
            const newDist = haversineKm(newLoc.lat, newLoc.lng, accident.latitude, accident.longitude);

            // Reassign only if new partner is meaningfully closer (threshold: 1 km)
            if (newDist < existingDist - 1.0) {
              await prisma.$runCommandRaw({
                findAndModify: 'accidents',
                query: { _id: alert.accidentId },
                update: {
                  $set: {
                    [`accepted_by_role.${roleKey}`]: responderId,
                    status: 'responded',
                    responder_id: responderId,
                    responder_type: role
                  }
                },
                new: true
              });
              reassigned = true;

              // Notify previous partner
              await RealtimeService.trigger(`entity:${existingResponderId}:alert`, 'alert:reassigned', {
                accidentId: alert.accidentId, alertId: alert.id,
                message: 'This alert has been reassigned to a closer responder.',
              }).catch(() => {});
              // Notify new (current) partner
              await RealtimeService.trigger(`entity:${responderId}:alert`, 'alert:assigned_nearest', {
                accidentId: alert.accidentId, alertId: alert.id,
                message: 'You have been assigned as the nearest responder.',
              }).catch(() => {});
              // Broadcast globally
              await RealtimeService.trigger(`accident-${alert.accidentId}`, 'alert:reassigned', {
                accidentId: alert.accidentId,
                previousResponderId: existingResponderId,
                newResponderId: responderId,
                responderType: role,
              }).catch(() => {});
              console.log(`🔄 [Reassignment] ${roleKey} | ${existingResponderId} (${existingDist.toFixed(2)}km) → ${responderId} (${newDist.toFixed(2)}km)`);
            }
          }

          if (!reassigned) {
            return res.status(409).json({
              success: false,
              message: 'This alert has already been accepted by another partner who is on the way.',
            });
          }
        } else {
          // No existing responder — claim atomically
          const commandResult: any = await prisma.$runCommandRaw({
            findAndModify: 'accidents',
            query: {
              _id: alert.accidentId,
              $or: [
                { [`accepted_by_role.${roleKey}`]: null },
                { accepted_by_role: null },
                { accepted_by_role: { $exists: false } }
              ]
            },
            update: {
              $set: {
                [`accepted_by_role.${roleKey}`]: responderId,
                status: 'responded',
                responder_id: responderId,
                responder_type: role
              }
            },
            new: true
          });

          if (!commandResult.value) {
            return res.status(409).json({
              success: false,
              message: 'This alert has already been accepted by another partner who is on the way.',
            });
          }
        }
      } else if (!isRanger) {
        // Fallback update for roles without a roleKey
        await AccidentRepository.update(alert.accidentId, {
          status: 'responded',
          responderId,
          responderType: role,
        });
      }
      // Rangers: no conflict check — multiple Rangers can accept the same alert

      // Record acceptance time in PanicAlertAuditLog
      try {
        await (prisma as any).panicAlertAuditLog.update({
          where: { accidentId: alert.accidentId },
          data: { acceptanceTime: new Date() }
        });
      } catch (logErr: any) {
        console.warn('Failed to update PanicAlertAuditLog acceptanceTime:', logErr.message);
      }

      await AccidentRepository.createStatusLog({
        accidentId: alert.accidentId,
        status: 'responded',
        responderId,
        responderType: role,
        notes: `Alert accepted by ${role} (${responderId}). ETA: ${eta} minutes. Notes: ${notes || ''}`,
      });

      // Generate Route
      let startLat = 0.0;
      let startLng = 0.0;

      if (['user', 'volunteer', 'fire_department'].includes(role)) {
        const u = await UserRepository.findUserById(responderId);
        startLat = u?.lastLocationLat || 0.0;
        startLng = u?.lastLocationLng || 0.0;
      } else if (role === 'hospital') {
        const h = await prisma.hospital.findUnique({ where: { id: responderId } });
        startLat = h?.latitude || 0.0;
        startLng = h?.longitude || 0.0;
      } else if (role === 'ambulance') {
        const a = await prisma.ambulanceDriver.findUnique({ where: { id: responderId } });
        startLat = a?.latitude || 0.0;
        startLng = a?.longitude || 0.0;
      } else if (role === 'policeman') {
        const p = await prisma.policeman.findUnique({ where: { id: responderId } });
        startLat = p?.latitude || 0.0;
        startLng = p?.longitude || 0.0;
      } else if (role === 'mechanic') {
        const m = await prisma.mechanic.findUnique({ where: { id: responderId } });
        startLat = m?.latitude || 0.0;
        startLng = m?.longitude || 0.0;
      }

      const routeData = await MapService.getRoute(startLat, startLng, accident.latitude, accident.longitude);

      const route = await RouteRepository.create({
        accidentId: alert.accidentId,
        fromEntityId: responderId,
        fromEntityType: role,
        toLat: accident.latitude,
        toLng: accident.longitude,
        distanceKm: routeData.distanceKm,
        etaMinutes: eta || routeData.etaMinutes,
        routePoints: routeData.points,
        status: 'active',
      });

      // Broadcast route updates
      await RealtimeService.trigger(`accident-${alert.accidentId}`, 'route:created', {
        route, responderId, responderType: role,
      });

      // Send push notification to the victim
      if (accident.userId) {
        await NotificationService.sendBrowserPush(
          accident.userId,
          '🤝 Savior On the Way!',
          `A responder (${role.toUpperCase()}) has accepted your emergency request and is en route. ETA: ${eta || 'few'} mins.`,
          { accidentId: accident.id, routeId: route.id }
        ).catch(err => console.error('Failed to notify victim via push:', err));
      }
    }

    // Fetch responder info for the payload
    let responderName = 'Responder';
    let responderMobile = '';
    let responderLocation = null;

    if (action === 'accepted') {
      if (['user', 'volunteer', 'fire_department'].includes(role)) {
        const u = await prisma.user.findUnique({ where: { id: responderId } });
        if (u) { responderName = u.fullName; responderMobile = u.mobile; responderLocation = { lat: u.lastLocationLat, lng: u.lastLocationLng }; }
      } else if (role === 'hospital') {
        const h = await prisma.hospital.findUnique({ where: { id: responderId } });
        if (h) { responderName = h.name; responderMobile = h.mobile; responderLocation = { lat: h.latitude, lng: h.longitude }; }
      } else if (role === 'ambulance') {
        const a = await prisma.ambulanceDriver.findUnique({ where: { id: responderId } });
        if (a) { responderName = a.name; responderMobile = a.mobile; responderLocation = { lat: a.latitude, lng: a.longitude }; }
      } else if (role === 'policeman') {
        const p = await prisma.policeman.findUnique({ where: { id: responderId } });
        if (p) { responderName = p.name; responderMobile = p.mobile; responderLocation = { lat: p.latitude, lng: p.longitude }; }
      } else if (role === 'mechanic') {
        const m = await prisma.mechanic.findUnique({ where: { id: responderId } });
        if (m) { responderName = m.name; responderMobile = m.mobile; responderLocation = { lat: m.latitude, lng: m.longitude }; }
      }
    }

    const payload = {
      accidentId: alert.accidentId, alertId: alert.id, responderId, responderType: role,
      action, etaMinutes: eta, notes, responderName, responderMobile, responderLocation,
      responderStatus: 'accepted'
    };

    // Broadcast acknowledgement globally
    await RealtimeService.trigger('accidents', 'alert:acknowledge', payload);
    await RealtimeService.trigger(`accident-${alert.accidentId}`, 'alert:acknowledge', payload);

    return res.status(200).json({ success: true, message: `Alert ${action} successfully`, alert: updatedAlert, acknowledgement: ack });
  } catch (error: any) {
    console.error('Respond Alert Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}));

router.post('/api/alerts/:id/deliver', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const alert = await prisma.alert.findUnique({ where: { id } });
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });

    const updated = await prisma.alert.update({
      where: { id },
      data: {
        status: 'delivered',
        deliveredAt: new Date(),
      } as any,
    });

    try {
      const auditLog = await (prisma as any).panicAlertAuditLog.findUnique({ where: { accidentId: alert.accidentId } });
      if (auditLog && !auditLog.deliveryTime) {
        await (prisma as any).panicAlertAuditLog.update({
          where: { accidentId: alert.accidentId },
          data: { deliveryTime: new Date() }
        });
      }
    } catch (logErr: any) {
      console.warn('Failed to update PanicAlertAuditLog deliveryTime:', logErr.message);
    }

    await RealtimeService.trigger(`accident-${alert.accidentId}`, 'alert:delivery', {
      alertId: id,
      accidentId: alert.accidentId,
      status: 'delivered',
      recipientId: alert.recipientId,
      recipientType: alert.recipientType,
    });

    return res.status(200).json({ success: true, alert: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

router.post('/api/alerts/:id/view', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const alert = await prisma.alert.findUnique({ where: { id } });
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });

    const updated = await prisma.alert.update({
      where: { id },
      data: {
        status: 'viewed',
        viewedAt: new Date(),
        readAt: new Date(),
      } as any,
    });

    await RealtimeService.trigger(`accident-${alert.accidentId}`, 'alert:viewed', {
      alertId: id,
      accidentId: alert.accidentId,
      status: 'viewed',
      recipientId: alert.recipientId,
      recipientType: alert.recipientType,
    });

    return res.status(200).json({ success: true, alert: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

const app = createExpressApp(router);

export default app;
