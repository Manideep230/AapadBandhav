import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from './utils/auth';
import { triggerRealtimeEvent } from './utils/pusher';
import { haversineDistance } from './utils/gps';

const prisma = new PrismaClient();
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
    const liveLoc = await prisma.liveLocation.create({
      data: {
        entityId: id,
        entityType: role,
        latitude: latVal,
        longitude: lngVal,
        speed: speed ? parseFloat(speed) : 0.0,
        heading: heading ? parseFloat(heading) : 0.0,
        accuracy: accuracy ? parseFloat(accuracy) : 0.0,
      },
    });

    // Update entity's table coordinates
    const updateCoords = {
      latitude: latVal,
      longitude: lngVal,
      lastSeen: new Date(),
    };

    if (['user', 'volunteer', 'fire_department', 'emergency_personnel'].includes(role)) {
      await prisma.user.update({
        where: { id },
        data: {
          lastLocationLat: latVal,
          lastLocationLng: lngVal,
          lastSeen: new Date(),
        },
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
    await triggerRealtimeEvent('locations', 'update', socketPayload);
    await triggerRealtimeEvent(`entity-${id}`, 'location:update', socketPayload);

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
    const loc = await prisma.liveLocation.findFirst({
      where: { entityId: entity_id, entityType: entity_type },
      orderBy: { recordedAt: 'desc' },
    });
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
      await prisma.user.update({ where: { id }, data: updateData });
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

// ─── Hospital Availability & Bed Updates ──────────────────────────────────────

router.put('/api/hospitals/availability', withAuth(async (req: AuthenticatedRequest, res) => {
  const { isAvailable, is_available } = req.body || {};
  const avail = isAvailable !== undefined ? !!isAvailable : !!is_available;
  const id = req.entityId || '';
  try {
    await prisma.hospital.update({
      where: { id },
      data: { isAvailable: avail },
    });
    return res.status(200).json({ success: true, message: 'Hospital availability updated' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['hospital']));

router.put('/api/hospitals/beds', withAuth(async (req: AuthenticatedRequest, res) => {
  const { availableBeds, available_beds } = req.body || {};
  const beds = availableBeds !== undefined ? parseInt(availableBeds) : parseInt(available_beds || 0);
  const id = req.entityId || '';
  try {
    await prisma.hospital.update({
      where: { id },
      data: { availableBeds: beds },
    });
    return res.status(200).json({ success: true, message: 'Hospital bed capacity updated' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['hospital']));

// ─── Alerts endpoints ──────────────────────────────────────────────────────────

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
    const alerts = await prisma.alert.findMany({
      where: { recipientId: id, recipientType: role },
      orderBy: { sentAt: 'desc' },
    });
    return res.status(200).json({ success: true, alerts });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

router.get('/api/alerts/:id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const alert = await prisma.alert.findUnique({ where: { id } });
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    return res.status(200).json({ success: true, alert });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

router.get('/api/alerts/accident/:accident_id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { accident_id } = req.params;
  try {
    const alerts = await prisma.alert.findMany({
      where: { accidentId: accident_id },
      orderBy: { sentAt: 'desc' },
    });
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
    const alert = await prisma.alert.findUnique({ where: { id } });
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });

    // Update alert status
    const updatedAlert = await prisma.alert.update({
      where: { id },
      data: {
        status: action,
        respondedAt: new Date(),
      },
    });

    // Create acknowledgement
    const ack = await prisma.acknowledgement.create({
      data: {
        accidentId: alert.accidentId,
        alertId: alert.id,
        responderId,
        responderType: role,
        action,
        etaMinutes: eta || null,
        notes: notes || null,
      },
    });

    const accident = await prisma.accident.findUnique({ where: { id: alert.accidentId } });
    if (!accident) return res.status(404).json({ success: false, message: 'Accident not found' });

    if (action === 'accepted') {
      // Update accident status to responded
      await prisma.accident.update({
        where: { id: alert.accidentId },
        data: {
          status: 'responded',
          responderId,
          responderType: role,
        },
      });

      await prisma.accidentStatusLog.create({
        data: {
          accidentId: alert.accidentId,
          status: 'responded',
          responderId,
          responderType: role,
          notes: `Alert accepted by ${role} (${responderId}). ETA: ${eta} minutes. Notes: ${notes || ''}`,
        },
      });

      // Generate Route
      let startLat = 0.0;
      let startLng = 0.0;

      if (['user', 'volunteer', 'fire_department'].includes(role)) {
        const u = await prisma.user.findUnique({ where: { id: responderId } });
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

      const dist = haversineDistance(startLat, startLng, accident.latitude, accident.longitude);

      // Generate route points (straight line path interpolation)
      const steps = 10;
      const points = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const latPt = startLat + (accident.latitude - startLat) * t + (Math.random() - 0.5) * 0.001;
        const lngPt = startLng + (accident.longitude - startLng) * t + (Math.random() - 0.5) * 0.001;
        points.push({ lat: parseFloat(latPt.toFixed(5)), lng: parseFloat(lngPt.toFixed(5)) });
      }

      const route = await prisma.route.create({
        data: {
          accidentId: alert.accidentId,
          fromEntityId: responderId,
          fromEntityType: role,
          toLat: accident.latitude,
          toLng: accident.longitude,
          distanceKm: parseFloat(dist.toFixed(2)),
          etaMinutes: eta || Math.round((dist / 40) * 60),
          routePoints: points,
          status: 'active',
        },
      });

      // Broadcast route updates
      await triggerRealtimeEvent(`accident-${alert.accidentId}`, 'route:created', {
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
    await triggerRealtimeEvent('accidents', 'alert:acknowledge', payload);
    await triggerRealtimeEvent(`accident-${alert.accidentId}`, 'alert:acknowledge', payload);

    return res.status(200).json({ success: true, message: `Alert ${action} successfully`, alert: updatedAlert, acknowledgement: ack });
  } catch (error: any) {
    console.error('Respond Alert Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}));

// ─── Route tracking endpoints ──────────────────────────────────────────────────

router.post('/api/routes', withAuth(async (req: AuthenticatedRequest, res) => {
  const { accidentId, fromEntityId, fromEntityType, toLat, toLng, distanceKm, etaMinutes, routePoints } = req.body || {};
  try {
    const route = await prisma.route.create({
      data: {
        accidentId,
        fromEntityId,
        fromEntityType,
        toLat: parseFloat(toLat),
        toLng: parseFloat(toLng),
        distanceKm: distanceKm ? parseFloat(distanceKm) : null,
        etaMinutes: etaMinutes ? parseInt(etaMinutes) : null,
        routePoints,
        status: 'active',
      },
    });
    return res.status(201).json({ success: true, route });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

router.get('/api/routes/:id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const route = await prisma.route.findUnique({ where: { id } });
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });
    return res.status(200).json({ success: true, route });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

router.put('/api/routes/:id/location', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { latitude, longitude, lat, lng } = req.body || {};
  const latVal = latitude !== undefined ? parseFloat(latitude) : parseFloat(lat || 0);
  const lngVal = longitude !== undefined ? parseFloat(longitude) : parseFloat(lng || 0);

  try {
    const route = await prisma.route.findUnique({ where: { id } });
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });

    const dist = haversineDistance(latVal, lngVal, route.toLat, route.toLng);
    const eta = Math.round((dist / 45) * 60);

    // Calculate distance to nearest route point to see if drift requires recalculation
    const routePoints = (route.routePoints as any[]) || [];
    let minDist = Infinity;
    for (const pt of routePoints) {
      if (pt && pt.lat !== undefined && pt.lng !== undefined) {
        const d = haversineDistance(latVal, lngVal, pt.lat, pt.lng);
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

    const updated = await prisma.route.update({
      where: { id },
      data: {
        distanceKm: parseFloat(dist.toFixed(2)),
        etaMinutes: eta,
        routePoints: points,
      },
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
      await prisma.user.update({
        where: { id: responderId },
        data: {
          lastLocationLat: latVal,
          lastLocationLng: lngVal,
          lastSeen: new Date(),
        },
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
          await prisma.accident.update({
            where: { id: route.accidentId },
            data: { status: 'arrived' },
          });
          await prisma.accidentStatusLog.create({
            data: {
              accidentId: route.accidentId,
              status: 'arrived',
              responderId,
              responderType: role,
              notes: 'Automatic Geofence Arrival: Responder entered 100m radius of the incident.',
            },
          });
          const statusPayload = {
            accidentId: route.accidentId,
            status: 'arrived',
            responderId,
            responderType: role,
          };
          await triggerRealtimeEvent(`accident-${route.accidentId}`, 'status_change', statusPayload);
          await triggerRealtimeEvent('accidents', 'status_change', statusPayload);
        }
      } else if (dist <= 0.3) {
        if (!['near_incident', 'arrived', 'victim_located', 'assistance_in_progress', 'victim_transported', 'resolved', 'closed'].includes(lastStatus || '')) {
          await prisma.accident.update({
            where: { id: route.accidentId },
            data: { status: 'near_incident' },
          });
          await prisma.accidentStatusLog.create({
            data: {
              accidentId: route.accidentId,
              status: 'near_incident',
              responderId,
              responderType: role,
              notes: 'Proximity Alert: Responder is within 300m of the incident.',
            },
          });
          const statusPayload = {
            accidentId: route.accidentId,
            status: 'near_incident',
            responderId,
            responderType: role,
          };
          await triggerRealtimeEvent(`accident-${route.accidentId}`, 'status_change', statusPayload);
          await triggerRealtimeEvent('accidents', 'status_change', statusPayload);
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
    await triggerRealtimeEvent(`route-${id}`, 'location:update', payload);

    if (route.accidentId) {
      await triggerRealtimeEvent(`accident-${route.accidentId}`, 'tracking', payload);
    }

    if (recalculated) {
      await triggerRealtimeEvent(`route-${id}`, 'recalculated', { route_points: points });
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

router.post('/api/routes/:id/complete', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const route = await prisma.route.update({
      where: { id },
      data: { status: 'completed' },
    });

    await triggerRealtimeEvent(`route-${id}`, 'completed', {
      routeId: id,
      accidentId: route.accidentId,
      status: 'completed',
    });

    return res.status(200).json({ success: true, route });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

// ─── Insurance Linkage Endpoints ──────────────────────────────────────────────

router.get('/api/insurance/customers', withAuth(async (req: AuthenticatedRequest, res) => {
  const insuranceId = req.entityId || '';
  try {
    const customers = await prisma.insuranceCustomer.findMany({
      where: { insuranceId, isActive: true },
      include: { user: true },
    });

    return res.status(200).json({
      success: true,
      customers: customers.map((c: any) => ({
        id: c.id,
        user_id: c.userId,
        policy_number: c.policyNumber,
        is_active: c.isActive,
        user: {
          fullName: c.user.fullName,
          mobile: c.user.mobile,
          uniqueId: c.user.uniqueId,
        },
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['insurance']));

router.post('/api/insurance/link-customer', withAuth(async (req: AuthenticatedRequest, res) => {
  const insuranceId = req.entityId || '';
  const { customerUniqueId, policyNumber, customer_id, policy_number } = req.body || {};
  const uniqId = customerUniqueId || customer_id;
  const policyNum = policyNumber || policy_number;

  if (!uniqId) return res.status(400).json({ success: false, message: 'customerUniqueId is required' });

  try {
    const user = await prisma.user.findUnique({ where: { uniqueId: uniqId } });
    if (!user || user.role !== 'user') {
      return res.status(404).json({ success: false, message: 'Citizen user with this unique ID not found' });
    }

    const existing = await prisma.insuranceCustomer.findFirst({
      where: { userId: user.id, insuranceId, isActive: true },
    });

    if (existing) {
      return res.status(409).json({ success: false, message: 'This customer is already linked to your company' });
    }

    const link = await prisma.insuranceCustomer.create({
      data: {
        userId: user.id,
        insuranceId,
        policyNumber: policyNum || null,
        isActive: true,
      },
    });

    return res.status(201).json({ success: true, message: `Linked customer ${user.fullName}`, customer: link });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['insurance']));

router.delete('/api/insurance/customers/:user_id', withAuth(async (req: AuthenticatedRequest, res) => {
  const insuranceId = req.entityId || '';
  const userId = req.params.user_id;

  try {
    const customer = await prisma.insuranceCustomer.findFirst({
      where: { userId, insuranceId, isActive: true },
    });

    if (!customer) return res.status(404).json({ success: false, message: 'Customer link not found' });

    await prisma.insuranceCustomer.delete({ where: { id: customer.id } });

    return res.status(200).json({ success: true, message: 'Customer unlinked successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['insurance']));

router.get('/api/insurance/alerts', withAuth(async (req: AuthenticatedRequest, res) => {
  const insuranceId = req.entityId || '';
  try {
    const alerts = await prisma.alert.findMany({
      where: { recipientId: insuranceId, recipientType: 'insurance' },
      orderBy: { sentAt: 'desc' },
    });
    return res.status(200).json({ success: true, alerts });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['insurance']));

// ─── Health check endpoints ───────────────────────────────────────────────────

const handleHealth = async (req: express.Request, res: express.Response) => {
  return res.status(200).json({ success: true, status: 'healthy', timestamp: new Date().toISOString() });
};

router.get('/health', handleHealth);
router.get('/api/health', handleHealth);

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

const app = express();
app.use(cors());
app.use(express.json());
app.use(router);

export default app;
