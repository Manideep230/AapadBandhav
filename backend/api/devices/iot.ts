import express from 'express';
import { createExpressApp } from '../../utils/expressApp';
import prisma from '../../config/db';
import { TrackingService } from '../../services/tracking';
import { RealtimeService } from '../../services/realtime';
import { runPhaseDispatch } from '../../services/dispatch';

const router = express.Router();

/**
 * @swagger
 * /api/iot/ingest:
 *   post:
 *     tags: [IoT]
 *     summary: Receive IoT device telemetry (MQTT over HTTP bridge)
 *     description: |
 *       Receives MQTT-format telemetry from IoT crash sensors via HTTP bridge.
 *       Processes GPS position, speed, impact G-force readings, and battery status.
 *
 *       **Auto-Crash Detection:** If `impactValue >= 3.0G`, automatically triggers an accident
 *       and initiates the full emergency dispatch pipeline (Inngest workflow, Pusher broadcast,
 *       alert dispatch to nearby responders).
 *
 *       **Topic Format:** `vehicle/{deviceId}/{nodeId}`
 *       - `nodeId` identifies the physical sensor (front, rear, side)
 *
 *       **Authentication:** No JWT required — authenticated via device credentials embedded in the topic/payload.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [topic, payload]
 *             properties:
 *               topic:
 *                 type: string
 *                 example: "vehicle/4810881048888104/front"
 *                 description: MQTT topic in format vehicle/{deviceId}/{nodeId}
 *               payload:
 *                 type: object
 *                 description: Sensor telemetry data
 *                 properties:
 *                   latitude: { type: number, example: 16.5062 }
 *                   longitude: { type: number, example: 80.648 }
 *                   speed: { type: number, example: 72.5, description: Speed in km/h }
 *                   impactValue: { type: number, example: 8.4, description: Crash impact in G-force }
 *                   batteryStatus: { type: number, example: 85.5, description: Battery percentage }
 *                   sensorStatus: { type: string, example: active }
 *     responses:
 *       200:
 *         description: Telemetry processed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Missing topic
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export async function ingestTelemetry(topic: string, payloadStr: any) {
  // Log raw MQTT event
  try {
    await prisma.mQTTEvent.create({
      data: {
        topic: String(topic),
        payload: typeof payloadStr === 'object' ? JSON.stringify(payloadStr) : String(payloadStr),
        processed: true,
      },
    });
  } catch (err) {
    console.error('[IoT Log Error] Failed to log MQTTEvent:', err);
  }

  if (!topic) {
    return { success: false, message: 'Topic is required' };
  }

  try {
    const parts = topic.split('/');
    if (parts.length === 3 && parts[0] === 'vehicle') {
      const deviceCode = parts[1];
      const nodeId = parts[2];

      let data: any = {};
      if (typeof payloadStr === 'string') {
        data = JSON.parse(payloadStr);
      } else {
        data = payloadStr;
      }

      const lat = data.latitude !== undefined ? parseFloat(data.latitude) : null;
      const lng = data.longitude !== undefined ? parseFloat(data.longitude) : null;
      const speed = data.speed !== undefined ? parseFloat(data.speed) : 0.0;
      const impactValue = data.impactValue !== undefined ? parseFloat(data.impactValue) : 0.0;
      const sensorStatus = data.sensorStatus || 'active';
      const batteryStatus = data.batteryStatus !== undefined ? parseFloat(data.batteryStatus) : 100.0;

      const device = await prisma.device.findUnique({
        where: { deviceId: deviceCode },
      });

      if (device) {
        let node = await prisma.ioTNode.findFirst({
          where: { deviceId: device.id, nodeId: nodeId },
        });

        if (!node) {
          node = await prisma.ioTNode.create({
            data: {
              deviceId: device.id,
              nodeId: nodeId,
            },
          });
        }

        const now = new Date();
        await prisma.ioTNode.update({
          where: { id: node.id },
          data: {
            latitude: lat,
            longitude: lng,
            speed,
            impactValue,
            sensorStatus,
            batteryStatus,
            lastSeen: now,
          },
        });

        let speedVal = 0.0;
        if (lat !== null && lng !== null) {
          speedVal = await TrackingService.processGpsSpeedAndLogs(device.deviceId, lat, lng, now);
          await TrackingService.checkAndUpdateDeviceStops(device.deviceId, lat, lng, speedVal);

          // 1. Record LiveLocation so map endpoints (/api/live-map/my-devices) pick up current coordinates
          try {
            await prisma.liveLocation.create({
              data: {
                entityId: device.deviceId,
                entityType: 'device',
                latitude: lat,
                longitude: lng,
                speed: speedVal || speed,
                recordedAt: now,
              },
            });
          } catch (locErr: any) {
            console.warn('[IoT Telemetry] LiveLocation save error:', locErr.message);
          }

          // 2. Update Device battery level and status
          try {
            await prisma.device.update({
              where: { id: device.id },
              data: {
                batteryLevel: Math.round(batteryStatus),
                status: 'active',
              },
            });
          } catch (devErr: any) {
            console.warn('[IoT Telemetry] Device status update error:', devErr.message);
          }

          // 3. Broadcast real-time location update to WebSocket/Pusher subscribers
          const socketPayload = {
            entityId: device.deviceId,
            entityType: 'device',
            latitude: lat,
            longitude: lng,
            speed: speedVal || speed,
            timestamp: now.toISOString(),
          };

          try {
            await RealtimeService.trigger('locations', 'update', socketPayload);
            await RealtimeService.trigger('locations', 'entity:location', socketPayload);
            await RealtimeService.trigger(`device-${device.deviceId}`, 'location', socketPayload);
            if (device.ownerId) {
              await RealtimeService.trigger(`user-${device.ownerId}`, 'device-location', socketPayload);
            }
          } catch (socketErr: any) {
            console.warn('[IoT Telemetry] Realtime socket trigger error:', socketErr.message);
          }
        }

        // Accident Collision Detection
        if (impactValue >= 3.0) {
          const fiveSecondsAgo = new Date(Date.now() - 5 * 1000);
          const otherImpacts = await prisma.ioTNode.findMany({
            where: {
              deviceId: device.id,
              impactValue: { gte: 3.0 },
              lastSeen: { gte: fiveSecondsAgo },
              nodeId: { not: nodeId },
            },
          });

          let severity = 'medium';
          let desc = `Single node collision detected at ${nodeId} with impact ${impactValue}G.`;

          if (otherImpacts.length > 0) {
            severity = 'critical';
            const impactNodes = [nodeId, ...otherImpacts.map((n: any) => n.nodeId)];
            const maxImpact = Math.max(impactValue, ...otherImpacts.map((n: any) => n.impactValue));
            desc = `Multi-node collision detected at ${impactNodes.join(', ')} with impacts up to ${maxImpact}G.`;
          } else if (impactValue >= 7.0) {
            severity = 'high';
            desc = `High severity single node impact at ${nodeId} with impact ${impactValue}G.`;
          }

          if (device.ownerId) {
            const owner = await prisma.user.findUnique({
              where: { id: device.ownerId },
            });

            if (owner) {
              const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
              const activeAccident = await prisma.accident.findFirst({
                where: {
                  userId: owner.id,
                  status: { in: ['active', 'dispatched', 'responded'] },
                  createdAt: { gte: fiveMinsAgo },
                },
              });

              if (!activeAccident) {
                const code = 'ACC-' + Math.floor(100000 + Math.random() * 900000).toString();

                const newAcc = await prisma.accident.create({
                  data: {
                    accidentCode: code,
                    userId: owner.id,
                    deviceId: device.id,
                    vehicleNumber: owner.vehicleNumber || 'N/A',
                    vehicleType: owner.vehicleType || 'Car',
                    latitude: lat || 0.0,
                    longitude: lng || 0.0,
                    severity,
                    description: desc,
                    speedAtImpact: speed,
                    locationAddress: (lat !== null && lng !== null) ? `${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E` : 'Unknown GPS',
                    status: 'active',
                  },
                });

                // Create PanicAlertAuditLog
                try {
                  await (prisma as any).panicAlertAuditLog.create({
                    data: {
                      accidentId: newAcc.id,
                      creationTime: new Date(),
                    }
                  });
                } catch (logErr: any) {
                  console.warn('Failed to create PanicAlertAuditLog in IoT Ingest:', logErr.message);
                }

                await prisma.accidentStatusLog.create({
                  data: {
                    accidentId: newAcc.id,
                    status: 'active',
                    notes: `Crash telemetry triggered by device ${device.deviceId} at node ${nodeId}. Impact: ${impactValue}G.`,
                  },
                });

                // Broadcast via Pusher
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
                  console.log(`[Immediate IoT Dispatch] Running Phase 1 dispatch for accident ${newAcc.id}...`);
                  await runPhaseDispatch(newAcc.id, 8, 1);
                } catch (dispatchErr: any) {
                  console.error('[Immediate IoT Dispatch Error] Failed to run Phase 1 dispatch:', dispatchErr.message);
                }
              }
            }
          }
        }
      }
    }

    return { success: true, message: 'Telemetry processed successfully' };
  } catch (error: any) {
    console.error('IoT Webhook Error:', error);
    return { success: false, message: error.message };
  }
}

router.post('/api/iot/ingest', async (req, res) => {
  const body = req.body || {};
  const topic = body.topic || '';
  const payloadStr = body.payload || '';

  if (!topic) {
    return res.status(400).json({ success: false, message: 'Topic is required' });
  }

  const result = await ingestTelemetry(topic, payloadStr);
  return res.status(result.success ? 200 : 500).json(result);
});

const app = createExpressApp(router);

export default app;
