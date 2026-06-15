import express from 'express';
import cors from 'cors';
import prisma from '../../config/db';
import { DeviceRepository } from '../../repositories/devices';
import { UserRepository } from '../../repositories/users';
import { withAuth, AuthenticatedRequest } from '../../middleware/auth';

const router = express.Router();

// ─── My Devices List ──────────────────────────────────────────────────────────

router.get('/api/devices/my-devices', withAuth(async (req: AuthenticatedRequest, res) => {
  const userId = req.entityId || '';
  try {
    const ownedDevices = await DeviceRepository.findByOwnerId(userId);

    const ownedList = [];
    for (const d of ownedDevices) {
      const vehicle = await prisma.vehicleInformation.findFirst({
        where: { deviceId: d.id },
      });
      ownedList.push({
        device: d,
        vehicle,
        role: 'owner',
      });
    }

    const shares = await DeviceRepository.findSharedDevices(userId);

    const sharedList = [];
    for (const s of shares) {
      const d = await DeviceRepository.findById(s.deviceId);
      if (d) {
        const vehicle = await prisma.vehicleInformation.findFirst({
          where: { deviceId: d.id },
        });
        const owner = await UserRepository.findUserById(d.ownerId || '');
        sharedList.push({
          device: d,
          vehicle,
          role: 'shared',
          ownerName: owner ? owner.fullName : 'Unknown',
        });
      }
    }

    return res.status(200).json({
      success: true,
      owned: ownedList,
      shared: sharedList,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['user', 'volunteer', 'fire_department']));

// ─── Register/Link Device by QR ───────────────────────────────────────────────

router.post('/api/devices/register-qr', withAuth(async (req: AuthenticatedRequest, res) => {
  const data = req.body || {};
  let deviceCode = data.deviceCode || data.device_id || '';
  const vehicleType = data.vehicle_type || data.vehicleType || 'Car';
  const vehicleNumber = data.vehicle_number || data.vehicleNumber;
  const vehicleModel = data.vehicle_model || data.vehicleModel;
  const manufacturer = data.manufacturer;
  const year = data.year;

  if (!deviceCode) {
    return res.status(422).json({ success: false, message: 'Device code is required' });
  }
  if (!vehicleNumber) {
    return res.status(422).json({ success: false, message: 'Vehicle number is required' });
  }

  deviceCode = String(deviceCode).trim().replace(/['"]/g, '');

  try {
    const device = await DeviceRepository.findByDeviceId(deviceCode);

    if (!device) {
      return res.status(422).json({ success: false, message: 'Device verification failed. Invalid 16-digit device code.' });
    }

    if (device.isLinked) {
      return res.status(422).json({ success: false, message: 'This device is already linked to another user.' });
    }

    // Link device
    const updatedDevice = await DeviceRepository.update(device.id, {
      ownerId: req.entityId,
      isLinked: true,
      linkedAt: new Date(),
      status: 'active',
      isActive: true,
    });

    // Link Vehicle details
    const vehicle = await prisma.vehicleInformation.create({
      data: {
        userId: req.entityId || '',
        deviceId: device.id,
        vehicleType,
        vehicleNumber,
        vehicleModel: vehicleModel || null,
        manufacturer: manufacturer || null,
        year: year ? parseInt(year) : null,
      },
    });

    // Update user vehicle details
    await UserRepository.updateUser(req.entityId || '', {
      vehicleNumber,
      vehicleType,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        entityType: 'user',
        entityId: req.entityId || '',
        action: 'register_device',
        details: `Linked device ${deviceCode} to vehicle ${vehicleNumber}`,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Device registered and vehicle details linked successfully',
      device: updatedDevice,
      vehicle,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['user', 'volunteer', 'fire_department']));

// ─── Share Device Access ─────────────────────────────────────────────────────

router.post('/api/devices/share', withAuth(async (req: AuthenticatedRequest, res) => {
  const { device_id, share_with_id } = req.body || {};
  if (!device_id || !share_with_id) {
    return res.status(422).json({ success: false, message: 'device_id and share_with_id are required' });
  }

  try {
    const device = await DeviceRepository.findById(device_id);
    if (!device || device.ownerId !== req.entityId) {
      return res.status(403).json({ success: false, message: 'Device not found or access denied' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { uniqueId: share_with_id },
    });

    if (!targetUser || targetUser.role !== 'user') {
      return res.status(404).json({ success: false, message: 'User with this AapadBandhav ID not found' });
    }

    if (targetUser.id === req.entityId) {
      return res.status(400).json({ success: false, message: 'Cannot share device with yourself' });
    }

    const existingShare = await DeviceRepository.findDeviceShare(device_id, targetUser.id);

    if (existingShare) {
      return res.status(409).json({ success: false, message: 'Device is already shared with this user' });
    }

    const share = await DeviceRepository.createShare({
      deviceId: device_id,
      userId: targetUser.id,
      role: 'viewer',
    });

    await prisma.auditLog.create({
      data: {
        entityType: 'user',
        entityId: req.entityId || '',
        action: 'share_device',
        details: `Shared device ${device.deviceId} with user ${targetUser.uniqueId}`,
      },
    });

    return res.status(201).json({
      success: true,
      message: `Successfully shared device with ${targetUser.fullName}`,
      share,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['user', 'volunteer', 'fire_department']));

router.post('/api/devices/unshare', withAuth(async (req: AuthenticatedRequest, res) => {
  const { device_id, user_id } = req.body || {};
  if (!device_id || !user_id) {
    return res.status(422).json({ success: false, message: 'device_id and user_id are required' });
  }

  try {
    const device = await DeviceRepository.findById(device_id);
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    if (device.ownerId !== req.entityId && user_id !== req.entityId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const share = await DeviceRepository.findDeviceShare(device_id, user_id);

    if (!share) {
      return res.status(404).json({ success: false, message: 'No active share found for this device and user' });
    }

    await DeviceRepository.deleteShare(share.id);

    await prisma.auditLog.create({
      data: {
        entityType: 'user',
        entityId: req.entityId || '',
        action: 'unshare_device',
        details: `Unshared device ${device.deviceId} from user ${user_id}`,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Device sharing access revoked successfully',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['user', 'volunteer', 'fire_department']));

router.get('/api/devices/shares/:device_id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { device_id } = req.params;
  try {
    const device = await DeviceRepository.findById(device_id);
    if (!device || device.ownerId !== req.entityId) {
      return res.status(403).json({ success: false, message: 'Device not found or access denied' });
    }

    const shares = await prisma.deviceShare.findMany({
      where: { deviceId: device_id },
    });

    const result = [];
    for (const s of shares) {
      const u = await UserRepository.findUserById(s.userId);
      if (u) {
        result.push({
          id: s.id,
          user_id: u.id,
          full_name: u.fullName,
          mobile: u.mobile,
          role: s.role,
        });
      }
    }

    return res.status(200).json({
      success: true,
      shares: result,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['user', 'volunteer', 'fire_department']));

// ─── Locate Device ───────────────────────────────────────────────────────────

router.all('/api/devices/locate', withAuth(async (req: AuthenticatedRequest, res) => {
  let deviceId: string | null = null;
  if (req.method === 'POST') {
    const data = req.body || {};
    deviceId = data.device_id || data.deviceCode || data.deviceId;
  } else {
    deviceId = (req.query.device_id || req.query.deviceCode || req.query.deviceId) as string;
  }

  if (!deviceId) {
    return res.status(422).json({ success: false, message: 'device_id is required' });
  }

  try {
    const device = await DeviceRepository.findByDeviceId(deviceId);

    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    // Verify Auth
    let isAuthorized = false;
    if (['admin', 'superadmin'].includes(req.entityRole || '')) {
      isAuthorized = true;
    } else if (device.ownerId === req.entityId) {
      isAuthorized = true;
    } else {
      const share = await DeviceRepository.findDeviceShare(device.id, req.entityId || '');
      if (share) isAuthorized = true;
    }

    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: 'Access denied for this device' });
    }

    const loc = await prisma.liveLocation.findFirst({
      where: { entityId: device.deviceId, entityType: 'device' },
      orderBy: { recordedAt: 'desc' },
    });

    if (!loc) {
      return res.status(200).json({
        success: true,
        device_id: device.deviceId,
        latitude: null,
        longitude: null,
        speed: 0.0,
        heading: 0.0,
        accuracy: 0.0,
        recorded_at: null,
        battery_level: device.batteryLevel,
        status: device.status,
        message: 'No location data available for this device',
      });
    }

    return res.status(200).json({
      success: true,
      device_id: device.deviceId,
      latitude: loc.latitude,
      longitude: loc.longitude,
      speed: loc.speed,
      heading: loc.heading,
      accuracy: loc.accuracy,
      recorded_at: loc.recordedAt.toISOString(),
      battery_level: device.batteryLevel,
      status: device.status,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

// ─── Stops (Rest Segments) & Rename & Logs ──────────────────────────────────────

router.get('/api/devices/:device_id/stops', withAuth(async (req: AuthenticatedRequest, res) => {
  const { device_id } = req.params;
  try {
    const device = await DeviceRepository.findByDeviceId(device_id);
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    let isAuthorized = false;
    let isOwner = false;

    if (device.ownerId === req.entityId) {
      isAuthorized = true;
      isOwner = true;
    } else {
      const share = await DeviceRepository.findDeviceShare(device.id, req.entityId || '');
      if (share) isAuthorized = true;
    }

    if (!isAuthorized) return res.status(403).json({ success: false, message: 'Access denied' });

    const stops = await DeviceRepository.findStops(device_id);

    return res.status(200).json({
      success: true,
      is_owner: isOwner,
      stops,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

router.put('/api/devices/:device_id/rename', withAuth(async (req: AuthenticatedRequest, res) => {
  const { device_id } = req.params;
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ success: false, message: 'name is required' });

  try {
    const device = await prisma.device.findFirst({
      where: { deviceId: device_id, ownerId: req.entityId },
    });

    if (!device) return res.status(404).json({ success: false, message: 'Device not found or not owned by you' });

    const updated = await DeviceRepository.update(device.id, { passName: name });

    return res.status(200).json({
      success: true,
      message: 'Device renamed successfully',
      device: updated,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['user', 'volunteer', 'fire_department']));

router.get('/api/devices/:device_id/logs', withAuth(async (req: AuthenticatedRequest, res) => {
  const { device_id } = req.params;
  try {
    const device = await DeviceRepository.findByDeviceId(device_id);
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    let isAuthorized = false;
    if (device.ownerId === req.entityId) {
      isAuthorized = true;
    } else {
      const share = await DeviceRepository.findDeviceShare(device.id, req.entityId || '');
      if (share) isAuthorized = true;
    }

    if (!isAuthorized) return res.status(403).json({ success: false, message: 'Access denied' });

    const logs = await DeviceRepository.findSpeedLogs(device.id);

    return res.status(200).json({
      success: true,
      logs: logs.map((l: any) => ({
        id: l.id,
        device_id: l.deviceId,
        latitude: l.latitude,
        longitude: l.longitude,
        speed: l.speed,
        timestamp: l.timestamp.toISOString(),
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

const app = express();
app.use(cors());
app.use(express.json());
app.use(router);

export default app;
