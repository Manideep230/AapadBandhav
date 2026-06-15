import express from 'express';
import cors from 'cors';
import prisma from '../../config/db';
import { RouteRepository } from '../../repositories/routes';
import { UserRepository } from '../../repositories/users';
import { RealtimeService } from '../../services/realtime';
import { withAuth, AuthenticatedRequest } from '../../middleware/auth';

const router = express.Router();

// ─── Live Location Updates ───────────────────────────────────────────────────

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

    const socketPayload = {
      entityId: id,
      entityType: role,
      latitude: latVal,
      longitude: lngVal,
      speed: liveLoc.speed,
      heading: liveLoc.heading,
      timestamp: liveLoc.recordedAt.toISOString(),
      name: req.user.fullName || req.user.name || 'Responder',
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

router.get('/api/locations/active-responders', withAuth(async (req: AuthenticatedRequest, res) => {
  try {
    const list: any[] = [];

    const ambs = await prisma.ambulanceDriver.findMany({ where: { isActive: true, isAvailable: true } });
    ambs.forEach((a: any) => {
      if (a.latitude !== null && a.longitude !== null) {
        list.push({ id: a.id, name: a.name, role: 'ambulance', latitude: a.latitude, longitude: a.longitude, mobile: a.mobile });
      }
    });

    const cops = await prisma.policeman.findMany({ where: { isActive: true, isAvailable: true } });
    cops.forEach((p: any) => {
      if (p.latitude !== null && p.longitude !== null) {
        list.push({ id: p.id, name: p.name, role: 'policeman', latitude: p.latitude, longitude: p.longitude, mobile: p.mobile });
      }
    });

    const mechs = await prisma.mechanic.findMany({ where: { isActive: true, isAvailable: true } });
    mechs.forEach((m: any) => {
      if (m.latitude !== null && m.longitude !== null) {
        list.push({ id: m.id, name: m.name, role: 'mechanic', latitude: m.latitude, longitude: m.longitude, mobile: m.mobile });
      }
    });

    const users = await prisma.user.findMany({
      where: { isActive: true, isAvailable: true, role: { in: ['volunteer', 'fire_department'] } },
    });
    users.forEach((u: any) => {
      if (u.lastLocationLat !== null && u.lastLocationLng !== null) {
        list.push({ id: u.id, name: u.fullName, role: u.role, latitude: u.lastLocationLat, longitude: u.lastLocationLng, mobile: u.mobile });
      }
    });

    return res.status(200).json({ success: true, responders: list });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.get('/api/locations/:entity_type/:entity_id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { entity_type, entity_id } = req.params;
  try {
    const loc = await RouteRepository.findLatestLiveLocation(entity_id, entity_type);
    return res.status(200).json({ success: true, location: loc });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

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
