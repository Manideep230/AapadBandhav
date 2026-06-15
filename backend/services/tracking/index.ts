import prisma from '../../config/db';
import { MapService } from '../maps';
import { RealtimeService } from '../realtime';

export class TrackingService {
  static async processGpsSpeedAndLogs(
    deviceCode: string,
    lat: number,
    lng: number,
    recordedAt: Date = new Date()
  ): Promise<number> {
    // Try finding device by ownerId == deviceCode first (for linked devices)
    let device = await prisma.device.findFirst({
      where: { ownerId: deviceCode, isLinked: true },
    });

    if (!device) {
      device = await prisma.device.findUnique({
        where: { deviceId: deviceCode },
      });
    }

    if (!device) {
      console.error(`[GPS process] Device not found for code: ${deviceCode}`);
      return 0.0;
    }

    // Find last GPSSpeedLog
    const lastLog = await prisma.gPSSpeedLog.findFirst({
      where: { deviceId: device.id },
      orderBy: { timestamp: 'desc' },
    });

    let speed = 0.0;
    if (lastLog) {
      const dist = MapService.haversineDistance(lastLog.latitude, lastLog.longitude, lat, lng);
      const timeDiffSeconds = (recordedAt.getTime() - new Date(lastLog.timestamp).getTime()) / 1000.0;
      if (timeDiffSeconds > 0) {
        speed = dist / (timeDiffSeconds / 3600.0);
        if (speed > 220.0) {
          speed = 220.0; // Cap speed
        }
      }
    }

    // Save log
    await prisma.gPSSpeedLog.create({
      data: {
        deviceId: device.id,
        latitude: lat,
        longitude: lng,
        speed: speed,
        timestamp: recordedAt,
      },
    });

    // Calculate average and peak speeds
    const speedLogs = await prisma.gPSSpeedLog.findMany({
      where: { deviceId: device.id },
    });

    const speeds = speedLogs.map((log) => log.speed);
    const avgSpeed = speeds.length > 0 ? parseFloat((speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(2)) : 0.0;
    const peakSpeed = speeds.length > 0 ? parseFloat(Math.max(...speeds).toFixed(2)) : 0.0;

    // Update device stats
    await prisma.device.update({
      where: { id: device.id },
      data: {
        currentSpeed: parseFloat(speed.toFixed(2)),
        averageSpeed: avgSpeed,
        peakSpeed: peakSpeed,
      },
    });

    return parseFloat(speed.toFixed(2));
  }

  static async checkAndUpdateDeviceStops(
    deviceCode: string,
    lat: number,
    lng: number,
    speed: number
  ): Promise<void> {
    try {
      const now = new Date();

      // Try finding device by ownerId == deviceCode first (for linked devices)
      let device = await prisma.device.findFirst({
        where: { ownerId: deviceCode, isLinked: true },
      });

      if (!device) {
        device = await prisma.device.findUnique({
          where: { deviceId: deviceCode },
        });
      }

      if (!device) return;

      const activeSeg = await prisma.restSegment.findFirst({
        where: {
          deviceId: device.deviceId,
          endTime: null,
        },
      });

      const isStopped = speed < 5.0;

      if (isStopped) {
        if (!activeSeg) {
          const prevSeg = await prisma.restSegment.findFirst({
            where: { deviceId: device.deviceId },
            orderBy: { stopNumber: 'desc' },
          });

          const stopNum = prevSeg ? prevSeg.stopNumber + 1 : 1;

          const newSeg = await prisma.restSegment.create({
            data: {
              deviceId: device.deviceId,
              latitude: lat,
              longitude: lng,
              stopNumber: stopNum,
              startTime: now,
              endTime: null,
            },
          });

          if (prevSeg) {
            // Update the previous segment to set end time
            const prevEndTime = now;
            const stopDurationSeconds = Math.round(
              (prevEndTime.getTime() - new Date(prevSeg.startTime).getTime()) / 1000
            );

            await prisma.restSegment.update({
              where: { id: prevSeg.id },
              data: {
                endTime: prevEndTime,
                stopDurationSeconds,
              },
            });

            // Fetch speed logs between prev.end_time and now
            const logs = await prisma.gPSSpeedLog.findMany({
              where: {
                deviceId: device.id,
                timestamp: {
                  gte: prevSeg.endTime || prevSeg.startTime,
                  lte: now,
                },
              },
              orderBy: { timestamp: 'asc' },
            });

            let path = logs.map((l) => ({ lat: l.latitude, lng: l.longitude }));
            if (path.length === 0) {
              path = [
                { lat: prevSeg.latitude, lng: prevSeg.longitude },
                { lat: lat, lng: lng },
              ];
            }

            let dist = 0.0;
            for (let i = 0; i < path.length - 1; i++) {
              dist += MapService.haversineDistance(path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng);
            }

            const duration = Math.round((now.getTime() - (prevSeg.endTime || prevSeg.startTime).getTime()) / 1000);
            let avgSp = 0.0;
            if (duration > 0) {
              avgSp = dist / (duration / 3600.0);
            }

            await prisma.restSegment.update({
              where: { id: newSeg.id },
              data: {
                travelPath: path,
                travelDistanceKm: parseFloat(dist.toFixed(2)),
                travelDurationSeconds: duration,
                avgSpeedKmh: parseFloat(Math.min(avgSp, 120.0).toFixed(2)),
              },
            });

            const notifMsg = `Vehicle ${device.passName || device.deviceId} moved from Rest Position ${prevSeg.stopNumber} to Rest Position ${newSeg.stopNumber}. Distance: ${dist.toFixed(2)}km, Travel Duration: ${(duration / 60).toFixed(1)} mins.`;

            const payload = {
              device_id: device.deviceId,
              device_name: device.passName || device.deviceId,
              from_stop: prevSeg.stopNumber,
              to_stop: newSeg.stopNumber,
              distance_km: parseFloat(dist.toFixed(2)),
              duration_seconds: duration,
              avg_speed_kmh: parseFloat(Math.min(avgSp, 120.0).toFixed(2)),
              rest_duration_seconds: stopDurationSeconds,
              message: notifMsg,
            };

            // Emit Pusher events
            await RealtimeService.trigger(`device-${device.deviceId}`, 'movement', payload);
            if (device.ownerId) {
              await RealtimeService.trigger(`user-${device.ownerId}`, 'device-movement', payload);
            }
          }
        }
      } else {
        if (activeSeg) {
          const stopDurationSeconds = Math.round(
            (now.getTime() - new Date(activeSeg.startTime).getTime()) / 1000
          );

          await prisma.restSegment.update({
            where: { id: activeSeg.id },
            data: {
              endTime: now,
              stopDurationSeconds,
            },
          });
        }
      }
    } catch (error) {
      console.error('[Rest detection error] Failing rest detection:', error);
    }
  }
}
