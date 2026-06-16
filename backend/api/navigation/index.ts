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
  const body = req.body || {};
  const accidentId = body.accidentId || body.accident_id;
  let fromEntityId = body.fromEntityId || body.from_entity_id || req.entityId;
  let fromEntityType = body.fromEntityType || body.from_entity_type || req.entityRole || 'user';
  
  let targetLat = body.toLat !== undefined ? parseFloat(body.toLat) : (body.to_lat !== undefined ? parseFloat(body.to_lat) : null);
  let targetLng = body.toLng !== undefined ? parseFloat(body.toLng) : (body.to_lng !== undefined ? parseFloat(body.to_lng) : null);

  let startLat = body.fromLat !== undefined ? parseFloat(body.fromLat) : (body.from_lat !== undefined ? parseFloat(body.from_lat) : null);
  let startLng = body.fromLng !== undefined ? parseFloat(body.fromLng) : (body.from_lng !== undefined ? parseFloat(body.from_lng) : null);

  try {
    // If we have accidentId, we can fetch the accident to get target Lat/Lng if not provided
    if (accidentId && (targetLat === null || targetLng === null || isNaN(targetLat) || isNaN(targetLng))) {
      const accident = await prisma.accident.findUnique({ where: { id: accidentId } });
      if (accident) {
        targetLat = accident.latitude;
        targetLng = accident.longitude;
      }
    }

    if (targetLat === null || targetLng === null || isNaN(targetLat) || isNaN(targetLng)) {
      return res.status(400).json({ success: false, message: 'Destination latitude and longitude (toLat, toLng) are required' });
    }

    // If start coordinates not provided, try to find them based on the entity
    if (startLat === null || startLng === null || isNaN(startLat) || isNaN(startLng)) {
      if (['user', 'volunteer', 'fire_department'].includes(fromEntityType)) {
        const u = await prisma.user.findUnique({ where: { id: fromEntityId } });
        startLat = u?.lastLocationLat || 16.5062;
        startLng = u?.lastLocationLng || 80.6480;
      } else if (fromEntityType === 'hospital') {
        const h = await prisma.hospital.findUnique({ where: { id: fromEntityId } });
        startLat = h?.latitude || 16.5062;
        startLng = h?.longitude || 80.6480;
      } else if (fromEntityType === 'ambulance') {
        const a = await prisma.ambulanceDriver.findUnique({ where: { id: fromEntityId } });
        startLat = a?.latitude || 16.5062;
        startLng = a?.longitude || 80.6480;
      } else if (fromEntityType === 'police_station') {
        const p = await prisma.policeStation.findUnique({ where: { id: fromEntityId } });
        startLat = p?.latitude || 16.5062;
        startLng = p?.longitude || 80.6480;
      } else if (fromEntityType === 'policeman') {
        const p = await prisma.policeman.findUnique({ where: { id: fromEntityId } });
        startLat = p?.latitude || 16.5062;
        startLng = p?.longitude || 80.6480;
      } else if (fromEntityType === 'mechanic') {
        const m = await prisma.mechanic.findUnique({ where: { id: fromEntityId } });
        startLat = m?.latitude || 16.5062;
        startLng = m?.longitude || 80.6480;
      } else {
        startLat = 16.5062;
        startLng = 80.6480;
      }
    }

    const routeData = await MapService.getRoute(startLat, startLng, targetLat, targetLng);
    const dist = routeData.distanceKm;
    const calculatedEta = routeData.etaMinutes;
    const points = routeData.points;

    // Check if an active route already exists for this accident and entity to avoid duplicates
    let route = await prisma.route.findFirst({
      where: {
        accidentId,
        fromEntityId,
        fromEntityType,
        status: 'active'
      }
    });

    if (!route) {
      route = await RouteRepository.create({
        accidentId,
        fromEntityId,
        fromEntityType,
        toLat: targetLat,
        toLng: targetLng,
        distanceKm: body.distanceKm ? parseFloat(body.distanceKm) : dist,
        etaMinutes: body.etaMinutes ? parseInt(body.etaMinutes) : calculatedEta,
        routePoints: body.routePoints || points,
        status: 'active',
      });
    }

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

    let dist = MapService.haversineDistance(latVal, lngVal, route.toLat, route.toLng);
    let eta = Math.round((dist / 45) * 60);

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
      const routeData = await MapService.getRoute(latVal, lngVal, route.toLat, route.toLng);
      points = routeData.points;
      dist = routeData.distanceKm;
      eta = routeData.etaMinutes;
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
          
          try {
            await (prisma as any).panicAlertAuditLog.update({
              where: { accidentId: route.accidentId },
              data: { arrivalTime: new Date() }
            });
          } catch (logErr: any) {
            console.warn('Failed to update PanicAlertAuditLog arrivalTime:', logErr.message);
          }

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
