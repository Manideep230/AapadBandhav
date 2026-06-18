import express from 'express';
import { serve } from 'inngest/express';
import prisma from '../../config/db';
import { inngest } from '../../config/inngest';
import { MapService } from '../../services/maps';
import { RealtimeService } from '../../services/realtime';
import { SMSService } from '../../services/sms';
import { UserRepository } from '../../repositories/users';
import { AlertRepository } from '../../repositories/alerts';
import { AccidentRepository } from '../../repositories/accidents';
import { NotificationService } from '../../services/notifications';
import { redis } from '../../services/redis';

async function findNearbyEntities(
  accLat: number,
  accLng: number,
  entities: any[],
  radiusKm: number
) {
  const nearby: any[] = [];
  for (const entity of entities) {
    const lat = entity.latitude !== undefined && entity.latitude !== null ? entity.latitude : entity.lastLocationLat;
    const lng = entity.longitude !== undefined && entity.longitude !== null ? entity.longitude : entity.lastLocationLng;
    if (lat === null || lat === undefined || lng === null || lng === undefined) continue;
    const dist = MapService.haversineDistance(accLat, accLng, lat, lng);
    if (dist <= radiusKm) {
      nearby.push({
        ...entity,
        distanceKm: parseFloat(dist.toFixed(2)),
        latitude: lat,
        longitude: lng,
      });
    }
  }
  return nearby.sort((a, b) => a.distanceKm - b.distanceKm);
}

function sortResponders(list: any[]) {
  return list.sort((a, b) => {
    const distDiff = (a.distanceKm || 0) - (b.distanceKm || 0);
    if (Math.abs(distDiff) > 0.5) return distDiff;
    const ratingDiff = (b.rating || 5.0) - (a.rating || 5.0);
    if (Math.abs(ratingDiff) > 0.1) return ratingDiff;
    const timeA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
    const timeB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
    return timeB - timeA;
  });
}

export async function runPhaseDispatch(accidentId: string, radiusKm: number, phase: number) {
  console.log(`⚡ Running Phase ${phase} dispatch for accident ${accidentId} (Radius: ${radiusKm}km)`);

  // Update dispatchTime in PanicAlertAuditLog
  try {
    const auditLog = await (prisma as any).panicAlertAuditLog.findUnique({ where: { accidentId } });
    if (auditLog && !auditLog.dispatchTime) {
      await (prisma as any).panicAlertAuditLog.update({
        where: { accidentId },
        data: { dispatchTime: new Date() }
      });
    }
  } catch (logErr: any) {
    console.warn('Failed to update PanicAlertAuditLog dispatchTime:', logErr.message);
  }

  const accident = await prisma.accident.findUnique({ where: { id: accidentId } });
  if (!accident || !['active', 'dispatched'].includes(accident.status)) {
    console.log(`⚠️ Accident ${accidentId} is not active or dispatched. Aborting dispatch.`);
    return 0;
  }

  const user = await UserRepository.findUserById(accident.userId || '');
  if (!user) {
    console.log(`⚠️ User associated with accident ${accidentId} not found. Aborting.`);
    return 0;
  }

  const device = await prisma.device.findFirst({
    where: { ownerId: user.id, isLinked: true }
  });
  const vehicle = await prisma.vehicleInformation.findFirst({
    where: { userId: user.id }
  });

  const lat = accident.latitude;
  const lng = accident.longitude;

  // 1. Notify Emergency Contacts in parallel to prevent sequential SMS delays
  const contacts = await UserRepository.findEmergencyContacts(user.id);
  await Promise.all(contacts.map(async (contact) => {
    try {
      await AlertRepository.create({
        accidentId: accident.id,
        recipientId: contact.id,
        recipientType: 'emergency_contact',
        message: `🚨 EMERGENCY: ${user.fullName} has been in an accident! Vehicle: ${accident.vehicleNumber || 'N/A'}. Location: ${lat}, ${lng}`,
        phase,
        status: 'sent',
      });

      await prisma.notification.create({
        data: {
          entityId: contact.id,
          entityType: 'emergency_contact',
          title: `Emergency Alert - ${user.fullName}`,
          message: `${user.fullName} may have been in an accident. Please call them immediately.`,
          type: 'accident',
          data: { accidentId: accident.id } as any,
        },
      });

      const smsBody = `AapadBandhav Emergency Alert\n\nAccident detected for:\nName: ${user.fullName}\nMobile: ${user.mobile}\nLocation: ${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E\nTime: ${new Date().toISOString()}\n\nPlease contact the person immediately.\n\nThank You,\nTeam NighaTech Global Pvt Ltd`;
      await SMSService.sendSMS(contact.mobile, smsBody, accident.id);
    } catch (contactErr: any) {
      console.error(`[Emergency Contacts] Failed to notify ${contact.id}:`, contactErr.message);
    }
  }));

  let alertsCount = 0;

  // Helper function to create alerts and emit socket/pusher event
  async function createAlert(recipientId: string, recipientType: string, message: string, dist: number, eta: number) {
    const existingAlert = await prisma.alert.findFirst({
      where: {
        accidentId: accident!.id,
        recipientId,
        recipientType,
      },
    });
    if (existingAlert) {
      return;
    }

    const alert = await AlertRepository.create({
      accidentId: accident!.id,
      recipientId,
      recipientType,
      message,
      phase,
      distanceKm: dist,
      etaMinutes: eta,
      status: 'sent',
    });

    await NotificationService.sendBrowserPush(
      recipientId,
      '🚨 Emergency SOS Dispatch Alert',
      message || 'You have been dispatched to a nearby emergency.',
      { accidentId: accident!.id, alertId: alert.id }
    ).catch(err => console.error('Failed to send browser push notification:', err));

    const payload = {
      type: 'accident_alert',
      alert,
      accident: accident!,
      user: {
        id: user!.id,
        fullName: user!.fullName,
        mobile: user!.mobile,
        bloodGroup: user!.bloodGroup,
        vehicleNumber: user!.vehicleNumber,
        vehicleType: user!.vehicleType,
        uniqueId: user!.uniqueId,
        unique_id: user!.uniqueId,
      },
      victim: {
        id: user!.id,
        fullName: user!.fullName,
        mobile: user!.mobile,
        bloodGroup: user!.bloodGroup,
        vehicleNumber: user!.vehicleNumber,
        vehicleType: user!.vehicleType,
        uniqueId: user!.uniqueId,
        unique_id: user!.uniqueId,
      },
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
    };

    // Pusher emits replacing Socket.IO rooms
    await RealtimeService.trigger(`entity-${recipientId}`, 'alert', payload);
    await RealtimeService.trigger(`entity-${recipientId}`, 'alert:new', {
      alert: {
        ...alert,
        accident: {
          ...accident!,
          vehicle_number: accident!.vehicleNumber,
          vehicle_type: accident!.vehicleType,
          location_address: accident!.locationAddress,
        },
        victim: {
          id: user!.id,
          full_name: user!.fullName,
          mobile: user!.mobile,
          blood_group: user!.bloodGroup,
          uniqueId: user!.uniqueId,
          unique_id: user!.uniqueId,
        },
        device: device ? {
          id: device.id,
          deviceId: device.deviceId,
          status: device.status,
          batteryLevel: device.batteryLevel,
        } : null,
        vehicle: vehicle ? {
          id: vehicle.id,
          vehicleType: vehicle.vehicleType,
          vehicleNumber: vehicle.vehicleNumber,
          vehicleModel: vehicle.vehicleModel,
        } : null,
      },
      accident: accident!,
      user: {
        id: user!.id,
        fullName: user!.fullName,
        mobile: user!.mobile,
        bloodGroup: user!.bloodGroup,
        uniqueId: user!.uniqueId,
      },
      device,
      vehicle,
    });
    alertsCount++;
  }

  // ── Optimized Geospatial Discovery with Redis Caching and DB Fallback ────
  let nearbyHospitals: any[] = [];
  let nearbyAmbulances: any[] = [];
  let nearbyStations: any[] = [];
  let nearbyPolicemen: any[] = [];
  let nearbyMechanics: any[] = [];
  let nearbyFire: any[] = [];
  let nearbyVolunteers: any[] = [];
  let insLink: any = null;

  let redisSuccess = false;
  try {
    const geosearchResult = await redis.geosearch(
      'active_responders_locations',
      'FROMLONLAT',
      lng,
      lat,
      'BYRADIUS',
      radiusKm,
      'km',
      'WITHDIST'
    );

    if (geosearchResult && geosearchResult.length > 0) {
      redisSuccess = true;
      const pipelines = redis.pipeline();
      geosearchResult.forEach((res: any) => {
        const member = res[0];
        pipelines.get(`responder:${member}`);
      });
      const cachedRespondersRaw = await pipelines.exec();
      const cachedResponders = cachedRespondersRaw ? cachedRespondersRaw
        .map((r: any) => {
          try {
            return r[1] ? JSON.parse(r[1]) : null;
          } catch {
            return null;
          }
        })
        .filter(Boolean) : [];

      const distanceMap = new Map<string, number>();
      geosearchResult.forEach((res: any) => {
        distanceMap.set(res[0], parseFloat(res[1]));
      });

      for (const responder of cachedResponders) {
        const key = `${responder.role}:${responder.id}`;
        const distanceKm = distanceMap.get(key) || 0.0;
        const mapped = {
          ...responder,
          distanceKm,
          etaMinutes: MapService.estimateETA(distanceKm, 40),
        };

        if (responder.role === 'hospital') nearbyHospitals.push(mapped);
        else if (responder.role === 'ambulance') nearbyAmbulances.push(mapped);
        else if (responder.role === 'police_station') nearbyStations.push(mapped);
        else if (responder.role === 'policeman') nearbyPolicemen.push(mapped);
        else if (responder.role === 'mechanic') nearbyMechanics.push(mapped);
        else if (responder.role === 'fire_department') nearbyFire.push(mapped);
        else if (responder.role === 'volunteer') nearbyVolunteers.push(mapped);
      }
    }
  } catch (redisErr: any) {
    console.warn('Redis geosearch failed, using DB scan fallback:', redisErr.message);
  }

  if (!redisSuccess || (nearbyHospitals.length === 0 && nearbyAmbulances.length === 0 && nearbyStations.length === 0 && nearbyPolicemen.length === 0 && nearbyMechanics.length === 0 && nearbyFire.length === 0 && nearbyVolunteers.length === 0)) {
    console.log('[Inngest] Falling back to MongoDB parallel scans...');
    const [
      hospitals,
      ambulances,
      stations,
      policemen,
      mechanics,
      firePersonnel,
      volunteers,
    ] = await Promise.all([
      prisma.hospital.findMany({ where: { isActive: true, isAvailable: true } }),
      prisma.ambulanceDriver.findMany({ where: { isActive: true, isAvailable: true } }),
      prisma.policeStation.findMany({ where: { isActive: true, isAvailable: true } }),
      prisma.policeman.findMany({ where: { isActive: true, isAvailable: true } }),
      prisma.mechanic.findMany({ where: { isActive: true, isAvailable: true } }),
      prisma.user.findMany({ where: { role: 'fire_department', isActive: true, isAvailable: true } }),
      prisma.user.findMany({ where: { role: 'volunteer', isActive: true, isAvailable: true } }),
    ]);

    const [
      fallbackHospitals,
      fallbackAmbulances,
      fallbackStations,
      fallbackPolicemen,
      fallbackMechanics,
      fallbackFire,
      fallbackVolunteers,
    ] = await Promise.all([
      findNearbyEntities(lat, lng, hospitals, radiusKm),
      findNearbyEntities(lat, lng, ambulances, radiusKm),
      findNearbyEntities(lat, lng, stations, radiusKm),
      findNearbyEntities(lat, lng, policemen, radiusKm),
      findNearbyEntities(lat, lng, mechanics, radiusKm),
      findNearbyEntities(lat, lng, firePersonnel, radiusKm),
      findNearbyEntities(lat, lng, volunteers, radiusKm),
    ]);

    nearbyHospitals = fallbackHospitals;
    nearbyAmbulances = fallbackAmbulances;
    nearbyStations = fallbackStations;
    nearbyPolicemen = fallbackPolicemen;
    nearbyMechanics = fallbackMechanics;
    nearbyFire = fallbackFire;
    nearbyVolunteers = fallbackVolunteers;
  }

  insLink = await prisma.insuranceCustomer.findFirst({
    where: { userId: user.id, isActive: true },
    include: { insurance: true },
  });

  // Apply multi-criteria Priority sorting
  sortResponders(nearbyHospitals);
  sortResponders(nearbyAmbulances);
  sortResponders(nearbyStations);
  sortResponders(nearbyPolicemen);
  sortResponders(nearbyMechanics);
  sortResponders(nearbyFire);
  sortResponders(nearbyVolunteers);

  // ── Create all alerts in PARALLEL across all groups ───────────────────────
  await Promise.all([
    // Hospitals (top 3)
    ...nearbyHospitals.slice(0, 3).map(hosp => {
      const eta = MapService.estimateETA(hosp.distanceKm, 50);
      const msg = `🚨 ACCIDENT ALERT | User: ${user.fullName} | Vehicle: ${accident.vehicleNumber || 'N/A'} | Blood: ${user.bloodGroup} | Distance: ${hosp.distanceKm}km | ETA: ${eta}min | Severity: ${accident.severity.toUpperCase()}`;
      return createAlert(hosp.id, 'hospital', msg, hosp.distanceKm, eta);
    }),

    // Ambulances (top 3)
    ...nearbyAmbulances.slice(0, 3).map(amb => {
      const eta = MapService.estimateETA(amb.distanceKm, 60);
      const msg = `🚨 ACCIDENT ALERT | User: ${user.fullName} | Vehicle: ${accident.vehicleNumber || 'N/A'} | Blood: ${user.bloodGroup} | Distance: ${amb.distanceKm}km | ETA: ${eta}min | Severity: ${accident.severity.toUpperCase()}`;
      return createAlert(amb.id, 'ambulance', msg, amb.distanceKm, eta);
    }),

    // Police Stations (top 2)
    ...nearbyStations.slice(0, 2).map(st => {
      const eta = MapService.estimateETA(st.distanceKm, 60);
      const msg = `🚨 ACCIDENT ALERT | User: ${user.fullName} | Vehicle: ${accident.vehicleNumber || 'N/A'} | Distance: ${st.distanceKm}km | ETA: ${eta}min`;
      return createAlert(st.id, 'police_station', msg, st.distanceKm, eta);
    }),

    // Policemen (top 3)
    ...nearbyPolicemen.slice(0, 3).map(cop => {
      const eta = MapService.estimateETA(cop.distanceKm, 50);
      const msg = `🚨 ACCIDENT ALERT | User: ${user.fullName} | Vehicle: ${accident.vehicleNumber || 'N/A'} | Distance: ${cop.distanceKm}km | ETA: ${eta}min`;
      return createAlert(cop.id, 'policeman', msg, cop.distanceKm, eta);
    }),

    // Mechanics (top 2)
    ...nearbyMechanics.slice(0, 2).map(mech => {
      const eta = MapService.estimateETA(mech.distanceKm, 30);
      const msg = `🚨 VEHICLE BREAKDOWN | User: ${user.fullName} | Distance: ${mech.distanceKm}km | ETA: ${eta}min`;
      return createAlert(mech.id, 'mechanic', msg, mech.distanceKm, eta);
    }),

    // Fire Departments (top 3)
    ...nearbyFire.slice(0, 3).map(fire => {
      const eta = MapService.estimateETA(fire.distanceKm, 55);
      const msg = `🔥 FIRE/ACCIDENT ALERT | User: ${user.fullName} | Vehicle: ${accident.vehicleNumber || 'N/A'} | Distance: ${fire.distanceKm}km | ETA: ${eta}min`;
      return createAlert(fire.id, 'fire_department', msg, fire.distanceKm, eta);
    }),

    // Volunteers (top 5)
    ...nearbyVolunteers.slice(0, 5).map(vol => {
      const eta = MapService.estimateETA(vol.distanceKm, 40);
      const msg = `🤝 VOLUNTEER EMERGENCY | User: ${user.fullName} | Vehicle: ${accident.vehicleNumber || 'N/A'} | Distance: ${vol.distanceKm}km | ETA: ${eta}min`;
      return createAlert(vol.id, 'volunteer', msg, vol.distanceKm, eta);
    }),

    // Insurance (linked company if any)
    ...(insLink ? (() => {
      const ins = insLink.insurance;
      const msg = `🚨 CLAIM ALERT: Your insured customer ${user.fullName} (Vehicle: ${accident.vehicleNumber || 'N/A'}) has been in an accident.`;
      return [createAlert(ins.id, 'insurance', msg, 0, 0)];
    })() : []),
  ]);

  // Update accident status to dispatched
  try {
    await AccidentRepository.update(accident.id, { status: 'dispatched' });
  } catch (updateErr: any) {
    console.warn(`Failed to update accident status (might be deleted concurrently):`, updateErr.message);
  }

  // Log dispatch completion
  try {
    await AccidentRepository.createStatusLog({
      accidentId: accident.id,
      status: 'alert_broadcasted',
      notes: `Emergency broadcasted to ${alertsCount} active responders in phase ${phase} within ${radiusKm}km.`,
    });
  } catch (logErr: any) {
    console.warn(`Failed to create status log (accident might be deleted):`, logErr.message);
  }

  // Emit status changes globally (in parallel)
  const statusPayload = {
    accidentId: accident.id,
    status: 'alert_broadcasted',
    notes: `Emergency broadcasted in phase ${phase} within ${radiusKm}km.`,
    timestamp: new Date().toISOString(),
  };

  await Promise.all([
    RealtimeService.trigger(`accident-${accident.id}`, 'status_change', statusPayload),
    RealtimeService.trigger('accidents', 'status_change', statusPayload),
    RealtimeService.trigger('accidents', 'dispatched', {
      accidentId: accident.id,
      phase,
      radiusKm,
      alertsSent: alertsCount,
      nearbyHospitals: nearbyHospitals.length,
      nearbyAmbulances: nearbyAmbulances.length,
      timestamp: new Date().toISOString(),
    }),
  ]);

  console.log(`✅ [Dispatch Phase ${phase}] Accident ${accident.accidentCode}: ${alertsCount} alerts sent.`);
  return alertsCount;
}

// Durable Escalation Workflow definition
export const accidentDispatchWorkflow = inngest.createFunction(
  { id: 'accident-dispatch-escalation' },
  { event: 'accident.triggered' },
  async ({ event, step }) => {
    const { accidentId } = event.data;

    // Phase 1 (8km)
    const alertsCount = await step.run('phase-1-dispatch', async () => {
      return await runPhaseDispatch(accidentId, 8, 1);
    });

    // If Phase 1 found zero responders, escalate immediately to 50km
    if (alertsCount === 0) {
      await step.run('immediate-phase-2-escalation', async () => {
        const accident = await prisma.accident.findUnique({ where: { id: accidentId } });
        if (accident && ['active', 'dispatched'].includes(accident.status)) {
          await runPhaseDispatch(accidentId, 50, 3);
          await RealtimeService.trigger('accidents', 'phase2', {
            accidentId,
            radiusKm: 50,
            message: 'No responders found within 8km. Expanding search radius to 50km immediately.',
          });
        }
      });
      return;
    }

    // Wait 15 seconds
    await step.sleep('wait-for-phase-1-5', '15s');

    // Phase 1.5 (15km)
    const runPhase15 = await step.run('phase-1-5-dispatch', async () => {
      const accident = await prisma.accident.findUnique({ where: { id: accidentId } });
      if (accident && ['active', 'dispatched'].includes(accident.status)) {
        await runPhaseDispatch(accidentId, 15, 1.5);
        await RealtimeService.trigger('accidents', 'phase1.5', {
          accidentId,
          code: accident.accidentCode,
          message: 'No response received within 15 seconds. Expanding search radius to 15km.',
        });
        return true;
      }
      return false;
    });

    if (!runPhase15) return;

    // Wait 15 seconds (total 30 seconds from trigger)
    await step.sleep('wait-for-phase-2', '15s');

    // Phase 2 (30km)
    const runPhase2 = await step.run('phase-2-dispatch', async () => {
      const accident = await prisma.accident.findUnique({ where: { id: accidentId } });
      if (accident && ['active', 'dispatched'].includes(accident.status)) {
        await runPhaseDispatch(accidentId, 30, 2);
        await RealtimeService.trigger('accidents', 'phase2', {
          accidentId,
          code: accident.accidentCode,
          message: 'No response received within 30 seconds. Expanding search radius to 30km.',
        });
        return true;
      }
      return false;
    });

    if (!runPhase2) return;

    // Wait 30 seconds (total 60 seconds from trigger)
    await step.sleep('wait-for-phase-3', '30s');

    // Phase 3 (Critical Escalation - 50km)
    await step.run('phase-3-dispatch', async () => {
      const accident = await prisma.accident.findUnique({ where: { id: accidentId } });
      if (accident && ['active', 'dispatched'].includes(accident.status)) {
        // Escalate severity to critical
        await AccidentRepository.update(accidentId, { severity: 'critical' });

        await AccidentRepository.createStatusLog({
          accidentId: accidentId,
          status: 'alert_broadcasted',
          notes: 'Escalation Phase 3: Severity escalated to CRITICAL due to responder response timeout.',
        });

        await runPhaseDispatch(accidentId, 50, 3);

        await RealtimeService.trigger('accidents', 'escalated', {
          accidentId,
          code: accident.accidentCode,
          severity: 'critical',
          message: 'CRITICAL ESCALATION: No responder accepted the alert within 60 seconds.',
        });
      }
    });
  }
);

const app = express();
app.use(express.json());
app.use(serve({
  client: inngest,
  functions: [accidentDispatchWorkflow],
}));

export default app;
