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

export async function runPhaseDispatch(accidentId: string, radiusKm: number, phase: number) {
  console.log(`⚡ Running Phase ${phase} dispatch for accident ${accidentId} (Radius: ${radiusKm}km)`);

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

  // 1. Notify Emergency Contacts
  const contacts = await UserRepository.findEmergencyContacts(user.id);
  for (const contact of contacts) {
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
  }

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

  // 2. Hospitals
  const hospitals = await prisma.hospital.findMany({ where: { isActive: true, isAvailable: true } });
  const nearbyHospitals = await findNearbyEntities(lat, lng, hospitals, radiusKm);
  for (const hosp of nearbyHospitals.slice(0, 3)) {
    const eta = MapService.estimateETA(hosp.distanceKm, 50);
    const msg = `🚨 ACCIDENT ALERT | User: ${user.fullName} | Vehicle: ${accident.vehicleNumber || 'N/A'} | Blood: ${user.bloodGroup} | Distance: ${hosp.distanceKm}km | ETA: ${eta}min | Severity: ${accident.severity.toUpperCase()}`;
    await createAlert(hosp.id, 'hospital', msg, hosp.distanceKm, eta);
  }

  // 3. Ambulances
  const ambulances = await prisma.ambulanceDriver.findMany({ where: { isActive: true, isAvailable: true } });
  const nearbyAmbulances = await findNearbyEntities(lat, lng, ambulances, radiusKm);
  for (const amb of nearbyAmbulances.slice(0, 3)) {
    const eta = MapService.estimateETA(amb.distanceKm, 60);
    const msg = `🚨 ACCIDENT ALERT | User: ${user.fullName} | Vehicle: ${accident.vehicleNumber || 'N/A'} | Blood: ${user.bloodGroup} | Distance: ${amb.distanceKm}km | ETA: ${eta}min | Severity: ${accident.severity.toUpperCase()}`;
    await createAlert(amb.id, 'ambulance', msg, amb.distanceKm, eta);
  }

  // 4. Police Stations
  const stations = await prisma.policeStation.findMany({ where: { isActive: true, isAvailable: true } });
  const nearbyStations = await findNearbyEntities(lat, lng, stations, radiusKm);
  for (const st of nearbyStations.slice(0, 2)) {
    const eta = MapService.estimateETA(st.distanceKm, 60);
    const msg = `🚨 ACCIDENT ALERT | User: ${user.fullName} | Vehicle: ${accident.vehicleNumber || 'N/A'} | Distance: ${st.distanceKm}km | ETA: ${eta}min`;
    await createAlert(st.id, 'police_station', msg, st.distanceKm, eta);
  }

  // 5. Policemen
  const policemen = await prisma.policeman.findMany({ where: { isActive: true, isAvailable: true } });
  const nearbyPolicemen = await findNearbyEntities(lat, lng, policemen, radiusKm);
  for (const cop of nearbyPolicemen.slice(0, 3)) {
    const eta = MapService.estimateETA(cop.distanceKm, 50);
    const msg = `🚨 ACCIDENT ALERT | User: ${user.fullName} | Vehicle: ${accident.vehicleNumber || 'N/A'} | Distance: ${cop.distanceKm}km | ETA: ${eta}min`;
    await createAlert(cop.id, 'policeman', msg, cop.distanceKm, eta);
  }

  // 6. Mechanics
  const mechanics = await prisma.mechanic.findMany({ where: { isActive: true, isAvailable: true } });
  const nearbyMechanics = await findNearbyEntities(lat, lng, mechanics, radiusKm);
  for (const mech of nearbyMechanics.slice(0, 2)) {
    const eta = MapService.estimateETA(mech.distanceKm, 30);
    const msg = `🚨 VEHICLE BREAKDOWN | User: ${user.fullName} | Distance: ${mech.distanceKm}km | ETA: ${eta}min`;
    await createAlert(mech.id, 'mechanic', msg, mech.distanceKm, eta);
  }

  // 7. Fire Departments
  const firePersonnel = await prisma.user.findMany({ where: { role: 'fire_department', isActive: true, isAvailable: true } });
  const nearbyFire = await findNearbyEntities(lat, lng, firePersonnel, radiusKm);
  for (const fire of nearbyFire.slice(0, 3)) {
    const eta = MapService.estimateETA(fire.distanceKm, 55);
    const msg = `🔥 FIRE/ACCIDENT ALERT | User: ${user.fullName} | Vehicle: ${accident.vehicleNumber || 'N/A'} | Distance: ${fire.distanceKm}km | ETA: ${eta}min`;
    await createAlert(fire.id, 'fire_department', msg, fire.distanceKm, eta);
  }

  // 8. Volunteers
  const volunteers = await prisma.user.findMany({ where: { role: 'volunteer', isActive: true, isAvailable: true } });
  const nearbyVolunteers = await findNearbyEntities(lat, lng, volunteers, radiusKm);
  for (const vol of nearbyVolunteers.slice(0, 5)) {
    const eta = MapService.estimateETA(vol.distanceKm, 40);
    const msg = `🤝 VOLUNTEER EMERGENCY | User: ${user.fullName} | Vehicle: ${accident.vehicleNumber || 'N/A'} | Distance: ${vol.distanceKm}km | ETA: ${eta}min`;
    await createAlert(vol.id, 'volunteer', msg, vol.distanceKm, eta);
  }

  // 9. Insurance
  const insLink = await prisma.insuranceCustomer.findFirst({
    where: { userId: user.id, isActive: true },
    include: { insurance: true }
  });
  if (insLink) {
    const ins = insLink.insurance;
    const msg = `🚨 CLAIM ALERT: Your insured customer ${user.fullName} (Vehicle: ${accident.vehicleNumber || 'N/A'}) has been in an accident.`;
    await createAlert(ins.id, 'insurance', msg, 0, 0);
  }

  // Update status
  await AccidentRepository.update(accident.id, { status: 'dispatched' });

  // Log status change
  await AccidentRepository.createStatusLog({
    accidentId: accident.id,
    status: 'alert_broadcasted',
    notes: `Emergency broadcasted to ${alertsCount} active responders in phase ${phase} within ${radiusKm}km.`,
  });

  // Emit status changes globally
  const statusPayload = {
    accidentId: accident.id,
    status: 'alert_broadcasted',
    notes: `Emergency broadcasted in phase ${phase} within ${radiusKm}km.`,
    timestamp: new Date().toISOString(),
  };

  await RealtimeService.trigger(`accident-${accident.id}`, 'status_change', statusPayload);
  await RealtimeService.trigger('accidents', 'status_change', statusPayload);

  // Emit dispatched summary
  await RealtimeService.trigger('accidents', 'dispatched', {
    accidentId: accident.id,
    phase,
    radiusKm,
    alertsSent: alertsCount,
    nearbyHospitals: nearbyHospitals.length,
    nearbyAmbulances: nearbyAmbulances.length,
    timestamp: new Date().toISOString(),
  });

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
          await runPhaseDispatch(accidentId, 50, 2);
          await RealtimeService.trigger('accidents', 'phase2', {
            accidentId,
            radiusKm: 50,
            message: 'No responders found within 8km. Expanding search radius to 50km immediately.',
          });
        }
      });
      return;
    }

    // Wait 30 seconds
    await step.sleep('wait-for-phase-2', '30s');

    // Phase 2 (25km)
    const runPhase2 = await step.run('phase-2-dispatch', async () => {
      const accident = await prisma.accident.findUnique({ where: { id: accidentId } });
      if (accident && ['active', 'dispatched'].includes(accident.status)) {
        await runPhaseDispatch(accidentId, 25, 2);
        await RealtimeService.trigger('accidents', 'phase2', {
          accidentId,
          code: accident.accidentCode,
          message: 'No response received. Expanding search radius to 25km.',
        });
        return true;
      }
      return false;
    });

    if (!runPhase2) return;

    // Wait 30 seconds
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
