import express from 'express';
import cors from 'cors';
import prisma from '../../config/db';
import { RouteRepository } from '../../repositories/routes';
import { UserRepository } from '../../repositories/users';
import { AccidentRepository } from '../../repositories/accidents';
import { RealtimeService } from '../../services/realtime';
import { MapService } from '../../services/maps';
import { withAuth, AuthenticatedRequest } from '../../middleware/auth';

const router = express.Router();

/**
 * @swagger
 * /api/routes:
 *   post:
 *     tags: [Navigation]
 *     summary: Create navigation route for a responder
 *     description: Creates a navigation route from a responder's location to the accident scene. Called automatically when a responder accepts an alert.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accidentId, toLat, toLng]
 *             properties:
 *               accidentId: { type: string }
 *               fromEntityId: { type: string }
 *               fromEntityType: { type: string, example: hospital }
 *               toLat: { type: number, example: 16.5062 }
 *               toLng: { type: number, example: 80.648 }
 *               distanceKm: { type: number, example: 3.5 }
 *               etaMinutes: { type: integer, example: 8 }
 *               routePoints: { type: array, items: { type: array, items: { type: number } } }
 *     responses:
 *       200:
 *         description: Route created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 route: { $ref: '#/components/schemas/RouteNavigation' }
 */
router.post('/api/routes', withAuth(async (req: AuthenticatedRequest, res) => {
  const { accidentId, fromEntityId, fromEntityType, toLat, toLng, distanceKm, etaMinutes, routePoints } = req.body || {};
  try {
    const route = await RouteRepository.create({
      accidentId,
      fromEntityId,
      fromEntityType,
      toLat: parseFloat(toLat),
      toLng: parseFloat(toLng),
      distanceKm: distanceKm ? parseFloat(distanceKm) : null,
      etaMinutes: etaMinutes ? parseInt(etaMinutes) : null,
      routePoints,
      status: 'active',
    });
    return res.status(201).json({ success: true, route });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

/**
 * @swagger
 * /api/routes/{id}:
 *   get:
 *     tags: [Navigation]
 *     summary: Get navigation route by ID
 *     description: Returns the full navigation route including waypoints and ETA.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Route data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 route: { $ref: '#/components/schemas/RouteNavigation' }
 */
router.get('/api/routes/:id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const route = await RouteRepository.findById(id);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });
    return res.status(200).json({ success: true, route });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

/**
 * @swagger
 * /api/routes/{id}/location:
 *   put:
 *     tags: [Navigation]
 *     summary: Update responder position along route
 *     description: Updates the responder's live position while navigating to the accident. Broadcasts update via Pusher.
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
 *             required: [latitude, longitude]
 *             properties:
 *               latitude: { type: number, example: 16.5062 }
 *               longitude: { type: number, example: 80.648 }
 *               speed: { type: number, example: 60 }
 *               heading: { type: number, example: 90 }
 *     responses:
 *       200:
 *         description: Position updated and broadcast
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 */
router.put('/api/routes/:id/location', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { latitude, longitude, lat, lng } = req.body || {};
  const latVal = latitude !== undefined ? parseFloat(latitude) : parseFloat(lat || 0);
  const lngVal = longitude !== undefined ? parseFloat(longitude) : parseFloat(lng || 0);

  try {
    const route = await RouteRepository.findById(id);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });

    const dist = MapService.haversineDistance(latVal, lngVal, route.toLat, route.toLng);
    const eta = Math.round((dist / 45) * 60);

    // Calculate distance to nearest route point to see if drift requires recalculation
    const routePoints = (route.routePoints as any[]) || [];
    let minDist = Infinity;
    for (const pt of routePoints) {
      if (pt && pt.lat !== undefined && pt.lng !== undefined) {
        const d = MapService.haversineDistance(latVal, lngVal, pt.lat, pt.lng);
        if (d < minDist) {
          minDist = d;
        }
      }
    }

    let recalculated = false;
    let points = routePoints;

    if (minDist > 0.2 && routePoints.length > 0) {
      recalculated = true;
      const steps = 10;
      points = [];
      const startLat = latVal;
      const startLng = lngVal;
      const toLat = route.toLat;
      const toLng = route.toLng;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const latPt = startLat + (toLat - startLat) * t + (Math.random() - 0.5) * 0.001;
        const lngPt = startLng + (toLng - startLng) * t + (Math.random() - 0.5) * 0.001;
        points.push({ lat: parseFloat(latPt.toFixed(5)), lng: parseFloat(lngPt.toFixed(5)) });
      }
    }

    const updated = await RouteRepository.update(id, {
      distanceKm: parseFloat(dist.toFixed(2)),
      etaMinutes: eta,
      routePoints: points,
    });

    // Update the responder entity coordinates
    const role = req.entityRole || 'user';
    const responderId = req.entityId || '';
    const updateCoords = {
      latitude: latVal,
      longitude: lngVal,
      lastSeen: new Date(),
    };

    if (['user', 'volunteer', 'fire_department', 'emergency_personnel'].includes(role)) {
      await UserRepository.updateUser(responderId, {
        lastLocationLat: latVal,
        lastLocationLng: lngVal,
        lastSeen: new Date(),
      });
    } else if (role === 'hospital') {
      await prisma.hospital.update({
        where: { id: responderId },
        data: { latitude: latVal, longitude: lngVal },
      });
    } else if (role === 'ambulance') {
      await prisma.ambulanceDriver.update({
        where: { id: responderId },
        data: updateCoords,
      });
    } else if (role === 'police_station') {
      await prisma.policeStation.update({
        where: { id: responderId },
        data: { latitude: latVal, longitude: lngVal },
      });
    } else if (role === 'policeman') {
      await prisma.policeman.update({
        where: { id: responderId },
        data: updateCoords,
      });
    } else if (role === 'mechanic') {
      await prisma.mechanic.update({
        where: { id: responderId },
        data: updateCoords,
      });
    }

    // Geofencing automatic status transitions
    if (route.accidentId) {
      const lastLog = await prisma.accidentStatusLog.findFirst({
        where: { accidentId: route.accidentId },
        orderBy: { createdAt: 'desc' },
      });
      const lastStatus = lastLog?.status || null;

      if (dist <= 0.1) {
        if (!['arrived', 'victim_located', 'assistance_in_progress', 'victim_transported', 'resolved', 'closed'].includes(lastStatus || '')) {
          await AccidentRepository.update(route.accidentId, { status: 'arrived' });
          await AccidentRepository.createStatusLog({
            accidentId: route.accidentId,
            status: 'arrived',
            responderId,
            responderType: role,
            notes: 'Automatic Geofence Arrival: Responder entered 100m radius of the incident.',
          });
          const statusPayload = {
            accidentId: route.accidentId,
            status: 'arrived',
            responderId,
            responderType: role,
          };
          await RealtimeService.trigger(`accident-${route.accidentId}`, 'status_change', statusPayload);
          await RealtimeService.trigger('accidents', 'status_change', statusPayload);
        }
      } else if (dist <= 0.3) {
        if (!['near_incident', 'arrived', 'victim_located', 'assistance_in_progress', 'victim_transported', 'resolved', 'closed'].includes(lastStatus || '')) {
          await AccidentRepository.update(route.accidentId, { status: 'near_incident' });
          await AccidentRepository.createStatusLog({
            accidentId: route.accidentId,
            status: 'near_incident',
            responderId,
            responderType: role,
            notes: 'Proximity Alert: Responder is within 300m of the incident.',
          });
          const statusPayload = {
            accidentId: route.accidentId,
            status: 'near_incident',
            responderId,
            responderType: role,
          };
          await RealtimeService.trigger(`accident-${route.accidentId}`, 'status_change', statusPayload);
          await RealtimeService.trigger('accidents', 'status_change', statusPayload);
        }
      }
    }

    const payload = {
      routeId: id,
      accidentId: route.accidentId,
      responderId,
      responderType: role,
      latitude: latVal,
      longitude: lngVal,
      distanceToDestKm: parseFloat(dist.toFixed(2)),
      etaMinutes: eta,
      recalculated,
    };

    // Emit live route path movement via Pusher
    await RealtimeService.trigger(`route-${id}`, 'location:update', payload);

    if (route.accidentId) {
      await RealtimeService.trigger(`accident-${route.accidentId}`, 'tracking', payload);
    }

    if (recalculated) {
      await RealtimeService.trigger(`route-${id}`, 'recalculated', { route_points: points });
    }

    return res.status(200).json({
      success: true,
      route: updated,
      recalculated,
      distanceToDestKm: parseFloat(dist.toFixed(2)),
      etaMinutes: eta,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

/**
 * @swagger
 * /api/routes/{id}/complete:
 *   post:
 *     tags: [Navigation]
 *     summary: Mark route as completed
 *     description: Marks the navigation route as completed when the responder arrives at the scene.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Route completed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 */
router.post('/api/routes/:id/complete', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const route = await RouteRepository.update(id, { status: 'completed' });

    await RealtimeService.trigger(`route-${id}`, 'completed', {
      routeId: id,
      accidentId: route.accidentId,
      status: 'completed',
    });

    return res.status(200).json({ success: true, route });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

const app = express();
app.use(cors());
app.use(express.json());
app.use(router);

export default app;
