import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import prisma from '../../config/db';
import { DeviceRepository } from '../../repositories/devices';
import { UserRepository } from '../../repositories/users';
import { MessageRepository } from '../../repositories/messages';
import { withAuth, AuthenticatedRequest } from '../../middleware/auth';

const router = express.Router();

function generate16DigitId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('');
}

// Helper to audit actions
async function auditAction(role: string, id: string, action: string, details: string) {
  try {
    await MessageRepository.createAuditLog({
      entityType: role,
      entityId: id,
      action,
      details,
    });
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}

// ─── Bulk Device Generation ──────────────────────────────────────────────────

router.post('/api/admin/devices/bulk', withAuth(async (req: AuthenticatedRequest, res) => {
  const { count } = req.body || {};
  if (!count || typeof count !== 'number' || count <= 0) {
    return res.status(422).json({ success: false, message: 'Count must be a positive integer' });
  }

  try {
    const generated = [];
    for (let i = 0; i < count; i++) {
      let devCode = '';
      while (true) {
        devCode = generate16DigitId();
        const dup = await DeviceRepository.findByDeviceId(devCode);
        if (!dup) break;
      }

      const passName = 'DEV' + crypto.randomBytes(4).toString('hex').toUpperCase();
      const passCode = 'PASS' + crypto.randomBytes(4).toString('hex').toUpperCase();
      const simCode = '88' + Array.from({ length: 11 }, () => Math.floor(Math.random() * 10)).join('');

      const device = await DeviceRepository.create({
        deviceId: devCode,
        passName,
        passCode,
        simCode,
        qrCode: JSON.stringify({
          deviceCode: devCode,
          passName,
          passCode,
          simCode,
        }),
        status: 'inactive',
        isActive: true,
        isLinked: false,
        batteryLevel: 100,
        firmwareVersion: '1.0.0',
      });
      generated.push(device);
    }

    await auditAction(req.entityRole || 'admin', req.entityId || 'admin-001', 'generate_device', `Generated ${count} devices in bulk`);

    return res.status(201).json({
      success: true,
      message: `Successfully generated ${count} devices in bulk`,
      devices: generated,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

// ─── Devices Inventory & Assigned list ────────────────────────────────────────

router.get('/api/admin/devices/inventory', withAuth(async (req: AuthenticatedRequest, res) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const status = req.query.status || 'all';

  try {
    const whereClause: any = { isLinked: false };
    if (status !== 'all') {
      whereClause.status = status;
    }

    const devices = await prisma.device.findMany({ where: whereClause });

    const filtered = search
      ? devices.filter(
          (d: any) =>
            d.deviceId.toLowerCase().includes(search) ||
            (d.passName && d.passName.toLowerCase().includes(search)) ||
            (d.simCode && d.simCode.toLowerCase().includes(search))
        )
      : devices;

    return res.status(200).json({
      success: true,
      devices: filtered,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.get('/api/admin/devices/assigned', withAuth(async (req: AuthenticatedRequest, res) => {
  const search = String(req.query.search || '').trim().toLowerCase();

  try {
    const devices = await prisma.device.findMany({
      where: { isLinked: true },
    });

    const assigned = [];
    for (const d of devices) {
      const user = await UserRepository.findUserById(d.ownerId || '');
      const vehicle = await prisma.vehicleInformation.findFirst({ where: { deviceId: d.id } });

      const item = {
        id: d.id,
        deviceCode: d.deviceId,
        passName: d.passName,
        passcode: d.passCode,
        simCode: d.simCode,
        status: d.status,
        is_active: d.isActive,
        registrationDate: d.linkedAt ? d.linkedAt.toISOString() : null,
        userName: user ? user.fullName : 'Unknown',
        mobile: user ? user.mobile : '—',
        vehicle,
      };

      if (search) {
        if (
          item.deviceCode.toLowerCase().includes(search) ||
          (item.passName && item.passName.toLowerCase().includes(search)) ||
          (item.simCode && item.simCode.toLowerCase().includes(search)) ||
          item.userName.toLowerCase().includes(search) ||
          item.mobile.toLowerCase().includes(search)
        ) {
          assigned.push(item);
        }
      } else {
        assigned.push(item);
      }
    }

    return res.status(200).json({
      success: true,
      devices: assigned,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.put('/api/admin/devices/:id/status', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { status } = req.body || {};

  if (!['active', 'inactive'].includes(status)) {
    return res.status(422).json({ success: false, message: "Status must be 'active' or 'inactive'" });
  }

  try {
    const device = await DeviceRepository.findById(id);
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    const updated = await DeviceRepository.update(id, {
      status,
      isActive: status === 'active',
    });

    await auditAction(
      req.entityRole || 'admin',
      req.entityId || 'admin-001',
      'toggle_device_status',
      `Changed status of device ${device.deviceId} to ${status}`
    );

    return res.status(200).json({
      success: true,
      message: `Device status set to ${status}`,
      device: updated,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.delete('/api/admin/devices/:id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const device = await DeviceRepository.findById(id);
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    if (device.isLinked) {
      return res.status(400).json({ success: false, message: 'Cannot delete a linked device. Unlink it first.' });
    }

    const devCode = device.deviceId;
    await DeviceRepository.delete(id);

    await auditAction(req.entityRole || 'admin', req.entityId || 'admin-001', 'delete_device', `Deleted device ${devCode}`);

    return res.status(200).json({
      success: true,
      message: 'Device deleted successfully',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

// ─── Analytics, Dashboard & Audit Logs ────────────────────────────────────────

router.get('/api/admin/dashboard', withAuth(async (req: AuthenticatedRequest, res) => {
  try {
    const totalAccidents = await prisma.accident.count({});
    const activeAccidents = await prisma.accident.count({ where: { status: { in: ['active', 'dispatched', 'responded'] } } });
    const resolvedAccidents = await prisma.accident.count({ where: { status: 'resolved' } });
    const totalDevices = await prisma.device.count({});
    const totalHospitals = await prisma.hospital.count({});
    const totalAmbulances = await prisma.ambulanceDriver.count({});

    const recentAccidents = await prisma.accident.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return res.status(200).json({
      success: true,
      stats: {
        totalAccidents,
        activeAccidents,
        resolvedAccidents,
        totalDevices,
        totalHospitals,
        totalAmbulances,
      },
      recentAccidents,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.get('/api/admin/manage/logs', withAuth(async (req: AuthenticatedRequest, res) => {
  try {
    const logs = await MessageRepository.findAuditLogs();
    return res.status(200).json({ success: true, logs });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

// ─── Admin services registration ──────────────────────────────────────────────

async function isMobileReserved(mobile: string): Promise<boolean> {
  const adminMobile = process.env.ADMIN_MOBILE || '9999999999';
  if (mobile.trim() === adminMobile.trim()) return true;

  if (await UserRepository.findUserByMobile(mobile)) return true;
  if (await UserRepository.findHospitalByMobile(mobile)) return true;
  if (await UserRepository.findAmbulanceByMobile(mobile)) return true;
  if (await UserRepository.findPoliceStationByMobile(mobile)) return true;
  if (await UserRepository.findPolicemanByMobile(mobile)) return true;
  if (await UserRepository.findMechanicByMobile(mobile)) return true;
  if (await UserRepository.findInsuranceByMobile(mobile)) return true;

  return false;
}

router.post('/api/admin/services/register', withAuth(async (req: AuthenticatedRequest, res) => {
  const data = req.body || {};
  const { role, name, mobile, latitude, longitude, city, state, bed_capacity } = data;

  if (!role || !name || !mobile) {
    return res.status(400).json({ success: false, message: 'role, name, and mobile are required' });
  }

  try {
    if (await isMobileReserved(mobile)) {
      return res.status(409).json({ success: false, message: 'Mobile number is already in use by another entity' });
    }

    const lat = latitude ? parseFloat(latitude) : 0.0;
    const lng = longitude ? parseFloat(longitude) : 0.0;

    let createdEntity: any = null;

    if (role === 'hospital') {
      createdEntity = await prisma.hospital.create({
        data: {
          name,
          mobile,
          latitude: lat,
          longitude: lng,
          city: city || 'Vijayawada',
          state: state || 'Andhra Pradesh',
          bedCapacity: bed_capacity ? parseInt(bed_capacity) : 0,
          availableBeds: bed_capacity ? parseInt(bed_capacity) : 0,
          isActive: true,
          isAvailable: true,
          mobileVerified: false,
        },
      });
    } else if (role === 'ambulance') {
      createdEntity = await prisma.ambulanceDriver.create({
        data: {
          name,
          mobile,
          vehicleNumber: data.vehicle_number || null,
          latitude: lat,
          longitude: lng,
          licenseNumber: data.license_number || null,
          isActive: true,
          isAvailable: true,
          mobileVerified: false,
        },
      });
    } else if (role === 'police_station') {
      createdEntity = await prisma.policeStation.create({
        data: {
          name,
          mobile,
          stationCode: data.station_code || null,
          latitude: lat,
          longitude: lng,
          city: city || null,
          state: state || null,
          address: data.address || null,
          isActive: true,
          isAvailable: true,
          mobileVerified: false,
        },
      });
    } else if (role === 'policeman') {
      createdEntity = await prisma.policeman.create({
        data: {
          name,
          mobile,
          badgeNumber: data.badge_number || null,
          stationId: data.station_id || null,
          latitude: lat,
          longitude: lng,
          isActive: true,
          isAvailable: true,
          mobileVerified: false,
        },
      });
    } else if (role === 'mechanic') {
      createdEntity = await prisma.mechanic.create({
        data: {
          name,
          mobile,
          specialization: data.specialization || null,
          latitude: lat,
          longitude: lng,
          isActive: true,
          isAvailable: true,
          mobileVerified: false,
        },
      });
    } else if (role === 'insurance') {
      createdEntity = await prisma.insuranceCompany.create({
        data: {
          name,
          mobile,
          licenseNumber: data.license_number || null,
          latitude: lat,
          longitude: lng,
          city: city || null,
          address: data.address || null,
          isActive: true,
          mobileVerified: false,
        },
      });
    } else {
      return res.status(400).json({ success: false, message: `Unsupported service role: ${role}` });
    }

    await auditAction(
      req.entityRole || 'admin',
      req.entityId || 'admin-001',
      'register_service_account',
      `Created service account ${name} (${role})`
    );

    return res.status(201).json({
      success: true,
      message: `Successfully registered ${role}`,
      [role]: createdEntity,
    });
  } catch (error: any) {
    console.error('Service Register Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.post('/api/admin/users/create', withAuth(async (req: AuthenticatedRequest, res) => {
  const { name, mobile, role, email, department } = req.body || {};

  if (!name || !mobile || !role) {
    return res.status(400).json({ success: false, message: 'name, mobile, and role are required' });
  }

  try {
    if (await isMobileReserved(mobile)) {
      return res.status(409).json({ success: false, message: 'Mobile number is already registered' });
    }

    let uniqueId = '';
    while (true) {
      const rest = Math.floor(100000 + Math.random() * 900000).toString();
      uniqueId = 'AB' + rest;
      const dup = await prisma.user.findUnique({ where: { uniqueId } });
      if (!dup) break;
    }

    const user = await UserRepository.createUser({
      fullName: name,
      mobile,
      role,
      uniqueId,
      email: email || null,
      department: department || null,
      isActive: true,
      isAvailable: true,
      mobileVerified: false, // will activate on first login
    });

    await auditAction(
      req.entityRole || 'admin',
      req.entityId || 'admin-001',
      'create_user_personnel',
      `Created personnel account ${name} (${role})`
    );

    return res.status(201).json({
      success: true,
      user,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

// ─── Sub-Admin Management (Superadmin Only) ───────────────────────────────────

router.get('/api/admin/manage/admins', withAuth(async (req: AuthenticatedRequest, res) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: ['admin', 'superadmin'] } },
    });
    return res.status(200).json({
      success: true,
      admins: admins.map((a: any) => ({
        id: a.id,
        name: a.fullName,
        mobile: a.mobile,
        email: a.email,
        role: a.role,
        permissions: a.permissions,
        is_active: a.isActive,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['superadmin']));

router.post('/api/admin/manage/admins', withAuth(async (req: AuthenticatedRequest, res) => {
  const { name, mobile, email, role, permissions } = req.body || {};
  if (!name || !mobile || !email) {
    return res.status(400).json({ success: false, message: 'name, mobile, and email are required' });
  }

  try {
    if (await isMobileReserved(mobile)) {
      return res.status(409).json({ success: false, message: 'Mobile number already in use' });
    }

    let uniqueId = '';
    while (true) {
      const rest = Math.floor(100000 + Math.random() * 900000).toString();
      uniqueId = 'AB' + rest;
      const dup = await prisma.user.findUnique({ where: { uniqueId } });
      if (!dup) break;
    }

    const admin = await UserRepository.createUser({
      fullName: name,
      mobile,
      email,
      uniqueId,
      role: role || 'admin',
      permissions: permissions || [],
      isActive: true,
      mobileVerified: true,
    });

    await auditAction(
      req.entityRole || 'superadmin',
      req.entityId || 'admin-001',
      'create_sub_admin',
      `Created sub-admin ${name}`
    );

    return res.status(201).json({
      success: true,
      admin: {
        id: admin.id,
        name: admin.fullName,
        mobile: admin.mobile,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['superadmin']));

router.put('/api/admin/manage/admins/:id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { name, email, role, permissions } = req.body || {};

  try {
    const admin = await UserRepository.updateUser(id, {
      fullName: name,
      email,
      role,
      permissions,
    });

    return res.status(200).json({
      success: true,
      admin: {
        id: admin.id,
        name: admin.fullName,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['superadmin']));

router.put('/api/admin/manage/admins/:id/toggle', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const admin = await UserRepository.findUserById(id);
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });

    const updated = await UserRepository.updateUser(id, { isActive: !admin.isActive });

    return res.status(200).json({
      success: true,
      admin: {
        id: updated.id,
        is_active: updated.isActive,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['superadmin']));

router.delete('/api/admin/manage/admins/:id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    await prisma.user.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'Admin deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['superadmin']));

// ─── Citizens List & Personnel Management ───

router.get('/api/admin/users', withAuth(async (req: AuthenticatedRequest, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { notIn: ['admin', 'superadmin'] } },
    });
    return res.status(200).json({
      success: true,
      users: users.map((u: any) => ({
        id: u.id,
        uniqueId: u.uniqueId,
        fullName: u.fullName,
        mobile: u.mobile,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        isAvailable: u.isAvailable,
        lastLogin: u.lastLogin ? u.lastLogin.toISOString() : null,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.put('/api/admin/users/:id/toggle', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const user = await UserRepository.findUserById(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const updated = await UserRepository.updateUser(id, { isActive: !user.isActive });

    return res.status(200).json({
      success: true,
      user: {
        id: updated.id,
        is_active: updated.isActive,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.delete('/api/admin/users/:id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    await prisma.user.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

// ─── Emergency Resources Management ───

router.get('/api/admin/resources', withAuth(async (req: AuthenticatedRequest, res) => {
  try {
    const resources = await prisma.emergencyResource.findMany({});
    return res.status(200).json({ success: true, resources });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.post('/api/admin/resources', withAuth(async (req: AuthenticatedRequest, res) => {
  const { name, type, vehicle_number } = req.body || {};
  if (!name || !type || !vehicle_number) {
    return res.status(400).json({ success: false, message: 'name, type, and vehicle_number are required' });
  }

  try {
    const resource = await prisma.emergencyResource.create({
      data: {
        name,
        type,
        vehicleNumber: vehicle_number,
        status: 'available',
        isActive: true,
      },
    });

    return res.status(201).json({ success: true, resource });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

const app = express();
app.use(cors());
app.use(express.json());
app.use(router);

export default app;
