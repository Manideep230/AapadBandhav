import express from 'express';
import cors from 'cors';
import prisma from '../../config/db';
import { AlertRepository } from '../../repositories/alerts';
import { AccidentRepository } from '../../repositories/accidents';
import { RouteRepository } from '../../repositories/routes';
import { UserRepository } from '../../repositories/users';
import { RealtimeService } from '../../services/realtime';
import { MapService } from '../../services/maps';
import { withAuth, AuthenticatedRequest } from '../../middleware/auth';

const router = express.Router();

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

router.get(ALERTS_CHANNELS, withAuth(async (req: AuthenticatedRequest, res) => {
  const role = req.entityRole || 'user';
  const id = req.entityId || '';
  try {
    const alerts = await AlertRepository.findByRecipient(id, role);
    return res.status(200).json({ success: true, alerts });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

router.get('/api/alerts/:id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const alert = await AlertRepository.findById(id);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    return res.status(200).json({ success: true, alert });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

router.get('/api/alerts/accident/:accident_id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { accident_id } = req.params;
  try {
    const alerts = await AlertRepository.findByAccidentId(accident_id);
    return res.status(200).json({ success: true, alerts });
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

    if (action === 'accepted') {
      // Update accident status to responded
      await AccidentRepository.update(alert.accidentId, {
        status: 'responded',
        responderId,
        responderType: role,
      });

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

      const dist = MapService.haversineDistance(startLat, startLng, accident.latitude, accident.longitude);

      // Generate route points (straight line path interpolation)
      const steps = 10;
      const points = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const latPt = startLat + (accident.latitude - startLat) * t + (Math.random() - 0.5) * 0.001;
        const lngPt = startLng + (accident.longitude - startLng) * t + (Math.random() - 0.5) * 0.001;
        points.push({ lat: parseFloat(latPt.toFixed(5)), lng: parseFloat(lngPt.toFixed(5)) });
      }

      const route = await RouteRepository.create({
        accidentId: alert.accidentId,
        fromEntityId: responderId,
        fromEntityType: role,
        toLat: accident.latitude,
        toLng: accident.longitude,
        distanceKm: parseFloat(dist.toFixed(2)),
        etaMinutes: eta || Math.round((dist / 40) * 60),
        routePoints: points,
        status: 'active',
      });

      // Broadcast route updates
      await RealtimeService.trigger(`accident-${alert.accidentId}`, 'route:created', {
        route,
        responderId,
        responderType: role,
      });
    }

    const payload = {
      accidentId: alert.accidentId,
      alertId: alert.id,
      responderId,
      responderType: role,
      action,
      etaMinutes: eta,
      notes,
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

const app = express();
app.use(cors());
app.use(express.json());
app.use(router);

export default app;
