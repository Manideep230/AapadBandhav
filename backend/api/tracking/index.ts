import express from 'express';
import cors from 'cors';
import prisma from '../../config/db';
import { RouteRepository } from '../../repositories/routes';
import { UserRepository } from '../../repositories/users';
import { RealtimeService } from '../../services/realtime';
import { withAuth, AuthenticatedRequest } from '../../middleware/auth';
import { redis } from '../../services/redis';

const router = express.Router();

// ─── Live Location Updates ───────────────────────────────────────────────────

/**
 * @swagger
 * /api/locations/update:
 *   post:
 *     tags: [Tracking]
 *     summary: Update live GPS location
 *     description: Broadcasts the authenticated entity's current GPS position to all subscribers via Pusher. Used by both users and responders during active incidents.
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
 *               speed: { type: number, example: 45.5, description: Speed in km/h }
 *               heading: { type: number, example: 270, description: Compass heading in degrees }
 *               accuracy: { type: number, example: 10 }
 *     responses:
 *       200:
 *         description: Location broadcast successfully
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 */
router.post('/api/locations/update', withAuth(async (req: AuthenticatedRequest, res) => {
  const { latitude, longitude, speed, heading, accuracy, lat, lng } = req.body || {};
  const latVal = latitude !== undefined ? parseFloat(latitude) : parseFloat(lat || 0);
  const lngVal = longitude !== undefined ? parseFloat(longitude) : parseFloat(lng || 0);

  const role = req.entityRole || 'user';
  const id = req.entityId || '';

  try {
    // Save to LiveLocation
    const liveLoc = await RouteRepository.createLiveLocation({
      entityId: id,
      entityType: role,
      latitude: latVal,
      longitude: lngVal,
      speed: speed ? parseFloat(speed) : 0.0,
      heading: heading ? parseFloat(heading) : 0.0,
      accuracy: accuracy ? parseFloat(accuracy) : 0.0,
    });

    // Update entity's table coordinates
    const updateCoords = {
      latitude: latVal,
      longitude: lngVal,
      lastSeen: new Date(),
    };

    if (['user', 'volunteer', 'fire_department', 'emergency_personnel'].includes(role)) {
      await UserRepository.updateUser(id, {
        lastLocationLat: latVal,
        lastLocationLng: lngVal,
        lastSeen: new Date(),
      });
    } else if (role === 'hospital') {
      await prisma.hospital.update({
        where: { id },
        data: { latitude: latVal, longitude: lngVal },
      });
    } else if (role === 'ambulance') {
      await prisma.ambulanceDriver.update({
        where: { id },
        data: updateCoords,
      });
    } else if (role === 'police_station') {
      await prisma.policeStation.update({
        where: { id },
        data: { latitude: latVal, longitude: lngVal },
      });
    } else if (role === 'policeman') {
      await prisma.policeman.update({
        where: { id },
        data: updateCoords,
      });
    } else if (role === 'mechanic') {
      await prisma.mechanic.update({
        where: { id },
        data: updateCoords,
      });
    } else if (role === 'insurance') {
      await prisma.insuranceCompany.update({
        where: { id },
        data: { latitude: latVal, longitude: lngVal },
      });
    }

    // Add to Redis Geoindex
    try {
      await redis.geoadd('active_responders_locations', lngVal, latVal, `${role}:${id}`);
      const metadata = {
        id,
        name: req.user?.fullName || req.user?.name || 'Responder',
        mobile: req.user?.mobile || '',
        role,
        rating: req.user?.rating || 5.0,
        lastSeen: new Date().toISOString(),
        latitude: latVal,
        longitude: lngVal,
      };
      await redis.set(`responder:${role}:${id}`, JSON.stringify(metadata), 'EX', 1800);
      console.log(`[Redis] Updated location for ${role}:${id} in geoindex.`);
    } catch (redisErr: any) {
      console.warn('Failed to update Redis location:', redisErr.message);
    }

    const socketPayload = {
      entityId: id,
      entityType: role,
      latitude: latVal,
      longitude: lngVal,
      speed: liveLoc.speed,
      heading: liveLoc.heading,
      timestamp: liveLoc.recordedAt.toISOString(),
      name: req.user?.fullName || req.user?.name || 'Responder',
    };

    // Emit live coordinate updates
    await RealtimeService.trigger('locations', 'update', socketPayload);
    await RealtimeService.trigger(`entity-${id}`, 'location:update', socketPayload);

    return res.status(200).json({ success: true, location: liveLoc });
  } catch (error: any) {
    console.error('Update Location Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}));

/**
 * @swagger
 * /api/locations/active-responders:
 *   get:
 *     tags: [Tracking]
 *     summary: Get all active responders on the live map
 *     description: Returns current GPS positions of all responders (hospitals, ambulances, police, mechanics, volunteers) who have updated their location in the last 30 minutes.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of active responders with positions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 responders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TrackingLocation'
 */
router.get('/api/locations/active-responders', withAuth(async (req: AuthenticatedRequest, res) => {
  try {
    const list: any[] = [];

    // Only consider entities whose location was updated within the last 30 minutes
    const cutoff30min = new Date(Date.now() - 30 * 60 * 1000);

    const [ambs, cops, mechs, users, hosps, stations, insCo] = await Promise.all([
      prisma.ambulanceDriver.findMany({
        where: {
          isActive: true,
          isAvailable: true,
          latitude: { not: null },
          longitude: { not: null },
          lastSeen: { gte: cutoff30min },
        },
      }),
      prisma.policeman.findMany({
        where: {
          isActive: true,
          isAvailable: true,
          latitude: { not: null },
          longitude: { not: null },
          lastSeen: { gte: cutoff30min },
        },
      }),
      prisma.mechanic.findMany({
        where: {
          isActive: true,
          isAvailable: true,
          latitude: { not: null },
          longitude: { not: null },
          lastSeen: { gte: cutoff30min },
        },
      }),
      // Include volunteers, fire_department, and users who opted in as Rangers
      prisma.user.findMany({
        where: {
          isActive: true,
          isAvailable: true,
          lastLocationLat: { not: null },
          lastLocationLng: { not: null },
          lastSeen: { gte: cutoff30min },
          OR: [
            { role: 'volunteer' },
            { role: 'fire_department' },
            { isRanger: true },
          ],
        },
      }),
      // Hospitals and fixed-location entities: no lastSeen filter (they don't move)
      prisma.hospital.findMany({
        where: {
          isActive: true,
          isAvailable: true,
          latitude: { not: null },
          longitude: { not: null },
        },
      }),
      prisma.policeStation.findMany({
        where: {
          isActive: true,
          isAvailable: true,
          latitude: { not: null },
          longitude: { not: null },
        },
      }),
      prisma.insuranceCompany.findMany({
        where: {
          isActive: true,
          latitude: { not: null },
          longitude: { not: null },
        },
      }),
    ]);

    ambs.forEach((a: any) => {
      list.push({
        id: a.id,
        name: a.name,
        role: 'ambulance',
        latitude: a.latitude,
        longitude: a.longitude,
        mobile: a.mobile,
        isAvailable: a.isAvailable,
        vehicleNumber: a.vehicleNumber,
        organization: a.organization,
        rating: 4.8,
      });
    });

    cops.forEach((p: any) => {
      list.push({
        id: p.id,
        name: p.name,
        role: 'policeman',
        latitude: p.latitude,
        longitude: p.longitude,
        mobile: p.mobile,
        isAvailable: p.isAvailable,
        badgeNumber: p.badgeNumber,
        rank: p.rank,
        department: p.department,
        rating: 4.9,
      });
    });

    mechs.forEach((m: any) => {
      list.push({
        id: m.id,
        name: m.name,
        role: 'mechanic',
        latitude: m.latitude,
        longitude: m.longitude,
        mobile: m.mobile,
        isAvailable: m.isAvailable,
        specialization: m.specialization,
        rating: m.rating || 4.0,
      });
    });

    users.forEach((u: any) => {
      list.push({
        id: u.id,
        name: u.fullName,
        role: u.isRanger && u.role === 'user' ? 'volunteer' : u.role,
        latitude: u.lastLocationLat,
        longitude: u.lastLocationLng,
        mobile: u.mobile,
        isAvailable: u.isAvailable,
        isRanger: u.isRanger,
        rating: 4.7,
      });
    });

    hosps.forEach((h: any) => {
      list.push({
        id: h.id,
        name: h.name,
        role: 'hospital',
        latitude: h.latitude,
        longitude: h.longitude,
        mobile: h.mobile,
        isAvailable: h.isAvailable,
        bedCapacity: h.bedCapacity,
        availableBeds: h.availableBeds,
        rating: 4.8,
      });
    });

    stations.forEach((s: any) => {
      list.push({
        id: s.id,
        name: s.name,
        role: 'police_station',
        latitude: s.latitude,
        longitude: s.longitude,
        mobile: s.mobile,
        isAvailable: s.isAvailable,
        stationCode: s.stationCode,
        rating: 4.6,
      });
    });

    insCo.forEach((i: any) => {
      list.push({
        id: i.id,
        name: i.name,
        role: 'insurance',
        latitude: i.latitude,
        longitude: i.longitude,
        mobile: i.mobile,
        isAvailable: true,
        licenseNumber: i.licenseNumber,
        rating: 4.5,
      });
    });

    return res.status(200).json({ success: true, responders: list });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

/**
 * @swagger
 * /api/locations/{entity_type}/{entity_id}:
 *   get:
 *     tags: [Tracking]
 *     summary: Get location of a specific entity
 *     description: Returns the current GPS position and status of a specific responder or user.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: entity_type
 *         in: path
 *         required: true
 *         schema: { type: string, example: hospital }
 *       - name: entity_id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Entity location
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 location: { $ref: '#/components/schemas/TrackingLocation' }
 */
router.get('/api/locations/:entity_type/:entity_id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { entity_type, entity_id } = req.params;
  try {
    const loc = await RouteRepository.findLatestLiveLocation(entity_id, entity_type);
    return res.status(200).json({ success: true, location: loc });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

/**
 * @swagger
 * /api/locations/status:
 *   put:
 *     tags: [Tracking]
 *     summary: Update availability status
 *     description: Updates the responder's availability status (available/busy/offline) without changing their GPS position.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [available, busy, offline]
 *                 example: available
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 */
router.put('/api/locations/status', withAuth(async (req: AuthenticatedRequest, res) => {
  const { isAvailable, is_available } = req.body || {};
  const avail = isAvailable !== undefined ? !!isAvailable : !!is_available;

  const role = req.entityRole || 'user';
  const id = req.entityId || '';

  try {
    const updateData = { isAvailable: avail };
    if (['user', 'volunteer', 'fire_department', 'emergency_personnel'].includes(role)) {
      await UserRepository.updateUser(id, updateData);
    } else if (role === 'hospital') {
      await prisma.hospital.update({ where: { id }, data: updateData });
    } else if (role === 'ambulance') {
      await prisma.ambulanceDriver.update({ where: { id }, data: updateData });
    } else if (role === 'police_station') {
      await prisma.policeStation.update({ where: { id }, data: updateData });
    } else if (role === 'policeman') {
      await prisma.policeman.update({ where: { id }, data: updateData });
    } else if (role === 'mechanic') {
      await prisma.mechanic.update({ where: { id }, data: updateData });
    }

    return res.status(200).json({ success: true, message: 'Availability status updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

const app = express();
app.use(cors());
app.use(express.json());
app.use(router);

export default app;
