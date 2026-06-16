import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import multer from 'multer';
import prisma from '../../config/db';
import { DeviceRepository } from '../../repositories/devices';
import { UserRepository } from '../../repositories/users';
import { MessageRepository } from '../../repositories/messages';
import { StorageService } from '../../services/storage';
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

function mapDeviceKeys(d: any) {
  if (!d) return d;
  return {
    ...d,
    device_id: d.deviceId,
    pass_name: d.passName,
    pass_code: d.passCode,
    sim_code: d.simCode,
    qr_code: d.qrCode,
  };
}

// ─── Bulk Device Generation ──────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/devices/bulk:
 *   post:
 *     tags: [Admin – Devices]
 *     summary: Bulk generate IoT devices
 *     description: Generates multiple IoT devices with unique device IDs, QR credentials, and SIM codes. Used for device provisioning.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [count]
 *             properties:
 *               count: { type: integer, minimum: 1, maximum: 100, example: 10 }
 *               prefix: { type: string, example: "AP" }
 *     responses:
 *       200:
 *         description: Devices generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 devices: { type: array, items: { $ref: '#/components/schemas/Device' } }
 *                 count: { type: integer }
 */
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
      devices: generated.map(mapDeviceKeys),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

// ─── Devices Inventory & Assigned list ────────────────────────────────────────

/**
 * @swagger
 * /api/admin/devices/inventory:
 *   get:
 *     tags: [Admin – Devices]
 *     summary: Get device inventory
 *     description: Returns full inventory of all IoT devices with status, assignment, and telemetry info.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [active, inactive, maintenance] }
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Device inventory
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 devices: { type: array, items: { $ref: '#/components/schemas/Device' } }
 *                 total: { type: integer }
 */
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
      devices: filtered.map(mapDeviceKeys),
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
      device: mapDeviceKeys(updated),
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

// ─── Bulk Device Operations & Sharing ────────────────────────────────────────

router.post('/api/admin/devices/bulk-activate', withAuth(async (req: AuthenticatedRequest, res) => {
  const { deviceIds } = req.body || {};
  if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
    return res.status(422).json({ success: false, message: 'deviceIds list is required' });
  }

  try {
    await prisma.device.updateMany({
      where: { id: { in: deviceIds } },
      data: { status: 'active', isActive: true }
    });

    await auditAction(
      req.entityRole || 'admin',
      req.entityId || 'admin-001',
      'bulk_activate_devices',
      `Bulk activated ${deviceIds.length} devices`
    );

    return res.status(200).json({ success: true, message: `Successfully activated ${deviceIds.length} devices` });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.post('/api/admin/devices/bulk-deactivate', withAuth(async (req: AuthenticatedRequest, res) => {
  const { deviceIds } = req.body || {};
  if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
    return res.status(422).json({ success: false, message: 'deviceIds list is required' });
  }

  try {
    await prisma.device.updateMany({
      where: { id: { in: deviceIds } },
      data: { status: 'inactive', isActive: false }
    });

    await auditAction(
      req.entityRole || 'admin',
      req.entityId || 'admin-001',
      'bulk_deactivate_devices',
      `Bulk deactivated ${deviceIds.length} devices`
    );

    return res.status(200).json({ success: true, message: `Successfully deactivated ${deviceIds.length} devices` });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.post('/api/admin/devices/bulk-delete', withAuth(async (req: AuthenticatedRequest, res) => {
  const { deviceIds } = req.body || {};
  if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
    return res.status(422).json({ success: false, message: 'deviceIds list is required' });
  }

  try {
    const linkedCount = await prisma.device.count({
      where: { id: { in: deviceIds }, isLinked: true }
    });
    if (linkedCount > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete linked devices. Unlink them first.' });
    }

    await prisma.device.deleteMany({
      where: { id: { in: deviceIds } }
    });

    await auditAction(
      req.entityRole || 'admin',
      req.entityId || 'admin-001',
      'bulk_delete_devices',
      `Bulk deleted ${deviceIds.length} devices`
    );

    return res.status(200).json({ success: true, message: `Successfully deleted ${deviceIds.length} devices` });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.post('/api/admin/devices/bulk-export', withAuth(async (req: AuthenticatedRequest, res) => {
  const { deviceIds } = req.body || {};
  if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
    return res.status(422).json({ success: false, message: 'deviceIds list is required' });
  }

  try {
    const devices = await prisma.device.findMany({
      where: { id: { in: deviceIds } }
    });

    return res.status(200).json({ success: true, devices: devices.map(mapDeviceKeys) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.post('/api/admin/devices/bulk-qr-download', withAuth(async (req: AuthenticatedRequest, res) => {
  const { deviceIds } = req.body || {};
  if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
    return res.status(422).json({ success: false, message: 'deviceIds list is required' });
  }

  try {
    const devices = await prisma.device.findMany({
      where: { id: { in: deviceIds } }
    });

    const qrs = devices.map(d => ({
      deviceId: d.deviceId,
      passName: d.passName,
      passCode: d.passCode,
      simCode: d.simCode,
      qrPayload: JSON.stringify({
        deviceId: d.deviceId,
        type: 'device_registration'
      })
    }));

    return res.status(200).json({ success: true, qrs });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.get('/api/admin/devices/shares', withAuth(async (req: AuthenticatedRequest, res) => {
  try {
    const shares = await prisma.deviceShare.findMany({
      include: {
        device: {
          include: {
            owner: true
          }
        },
        user: true
      }
    });

    const result = shares.map(s => ({
      share_id: s.id,
      device_code: s.device.deviceId,
      owner_name: s.device.owner ? s.device.owner.fullName : 'Unknown',
      shared_with_name: s.user.fullName,
      shared_with_unique_id: s.user.uniqueId,
      shared_with_mobile: s.user.mobile,
      created_at: s.createdAt.toISOString()
    }));

    return res.status(200).json({ success: true, shares: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.delete('/api/admin/devices/shares/:id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    await prisma.deviceShare.delete({
      where: { id }
    });

    await auditAction(
      req.entityRole || 'admin',
      req.entityId || 'admin-001',
      'revoke_device_share',
      `Revoked sharing relationship ${id}`
    );

    return res.status(200).json({ success: true, message: 'Device access share revoked successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

// ─── Partner Approval Workflow ─────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/partners/pending:
 *   get:
 *     tags: [Admin – Partners]
 *     summary: List all pending partner applications
 *     description: Returns all service accounts that have been self-registered and are awaiting admin approval (isActive=false, mobileVerified=true).
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending partner applications
 */
router.get('/api/admin/partners/pending', withAuth(async (req: AuthenticatedRequest, res) => {
  try {
    const [hospitals, ambulances, policeStations, policemen, mechanics, insurances, volunteers, fireDepts] = await Promise.all([
      prisma.hospital.findMany({ where: { isActive: false, mobileVerified: true } }),
      prisma.ambulanceDriver.findMany({ where: { isActive: false, mobileVerified: true } }),
      prisma.policeStation.findMany({ where: { isActive: false, mobileVerified: true } }),
      prisma.policeman.findMany({ where: { isActive: false, mobileVerified: true } }),
      prisma.mechanic.findMany({ where: { isActive: false, mobileVerified: true } }),
      prisma.insuranceCompany.findMany({ where: { isActive: false, mobileVerified: true } }),
      prisma.user.findMany({ where: { role: 'volunteer', isActive: false, mobileVerified: true } }),
      prisma.user.findMany({ where: { role: 'fire_department', isActive: false, mobileVerified: true } }),
    ]);

    const pending = [
      ...hospitals.map(e => ({ ...e, _role: 'hospital', _displayName: e.name })),
      ...ambulances.map(e => ({ ...e, _role: 'ambulance', _displayName: e.name })),
      ...policeStations.map(e => ({ ...e, _role: 'police_station', _displayName: e.name })),
      ...policemen.map(e => ({ ...e, _role: 'policeman', _displayName: e.name })),
      ...mechanics.map(e => ({ ...e, _role: 'mechanic', _displayName: e.name })),
      ...insurances.map(e => ({ ...e, _role: 'insurance', _displayName: e.name })),
      ...volunteers.map(e => ({ ...e, _role: 'volunteer', _displayName: e.fullName })),
      ...fireDepts.map(e => ({ ...e, _role: 'fire_department', _displayName: e.fullName })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.status(200).json({ success: true, pending, count: pending.length });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

/**
 * @swagger
 * /api/admin/partners/{role}/{id}/approve:
 *   post:
 *     tags: [Admin – Partners]
 *     summary: Approve a pending partner application
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: role
 *         in: path
 *         schema: { type: string }
 *       - name: id
 *         in: path
 *         schema: { type: string }
 */
router.post('/api/admin/partners/:role/:id/approve', withAuth(async (req: AuthenticatedRequest, res) => {
  const { role, id } = req.params;

  const SERVICE_ROLE_MAP: Record<string, any> = {
    hospital: prisma.hospital,
    ambulance: prisma.ambulanceDriver,
    police_station: prisma.policeStation,
    policeman: prisma.policeman,
    mechanic: prisma.mechanic,
    insurance: prisma.insuranceCompany,
  };

  try {
    let entity: any = null;

    if (SERVICE_ROLE_MAP[role]) {
      entity = await SERVICE_ROLE_MAP[role].update({
        where: { id },
        data: { isActive: true, mobileVerified: true },
      });
    } else if (role === 'volunteer' || role === 'fire_department') {
      entity = await prisma.user.update({
        where: { id },
        data: { isActive: true, mobileVerified: true },
      });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    await auditAction(
      req.entityRole || 'admin',
      req.entityId || 'admin-001',
      'approve_partner',
      `Approved partner application: role=${role}, id=${id}, name=${entity.name || entity.fullName}`
    );

    return res.status(200).json({ success: true, message: `Partner approved. They can now log in via OTP.` });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Partner not found' });
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

/**
 * @swagger
 * /api/admin/partners/{role}/{id}/reject:
 *   post:
 *     tags: [Admin – Partners]
 *     summary: Reject and delete a pending partner application
 *     security:
 *       - BearerAuth: []
 */
router.post('/api/admin/partners/:role/:id/reject', withAuth(async (req: AuthenticatedRequest, res) => {
  const { role, id } = req.params;

  const SERVICE_ROLE_MAP: Record<string, any> = {
    hospital: prisma.hospital,
    ambulance: prisma.ambulanceDriver,
    police_station: prisma.policeStation,
    policeman: prisma.policeman,
    mechanic: prisma.mechanic,
    insurance: prisma.insuranceCompany,
  };

  try {
    let entityName = '';

    if (SERVICE_ROLE_MAP[role]) {
      const entity = await SERVICE_ROLE_MAP[role].findUnique({ where: { id } });
      if (!entity) return res.status(404).json({ success: false, message: 'Partner not found' });
      entityName = entity.name || '';
      await SERVICE_ROLE_MAP[role].delete({ where: { id } });
    } else if (role === 'volunteer' || role === 'fire_department') {
      const entity = await prisma.user.findUnique({ where: { id } });
      if (!entity) return res.status(404).json({ success: false, message: 'Partner not found' });
      entityName = entity.fullName || '';
      await prisma.user.delete({ where: { id } });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    await auditAction(
      req.entityRole || 'admin',
      req.entityId || 'admin-001',
      'reject_partner',
      `Rejected and removed partner application: role=${role}, id=${id}, name=${entityName}`
    );

    return res.status(200).json({ success: true, message: 'Partner application rejected and removed.' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Partner not found' });
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

// ─── Analytics, Dashboard & Audit Logs ────────────────────────────────────────

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     tags: [Admin – Dashboard]
 *     summary: Admin dashboard KPIs
 *     description: Returns key platform metrics including total accidents, active incidents, responder counts, and device status.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalAccidents: { type: integer }
 *                     activeAccidents: { type: integer }
 *                     resolvedAccidents: { type: integer }
 *                     totalUsers: { type: integer }
 *                     totalDevices: { type: integer }
 *                     totalHospitals: { type: integer }
 */
router.get('/api/admin/dashboard', withAuth(async (req: AuthenticatedRequest, res) => {
  try {
    const totalUsers = await prisma.user.count({ where: { role: { notIn: ['admin', 'superadmin'] } } });
    const totalAccidents = await prisma.accident.count({});
    const activeAccidents = await prisma.accident.count({ where: { status: { in: ['active', 'dispatched', 'responded'] } } });
    const resolvedAccidents = await prisma.accident.count({ where: { status: 'resolved' } });
    const totalDevices = await prisma.device.count({});
    const linkedDevices = await prisma.device.count({ where: { isLinked: true } });
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
      dashboard: {
        users: { total: totalUsers },
        accidents: { active: activeAccidents, resolved: resolvedAccidents },
        services: { hospitals: totalHospitals, ambulances: totalAmbulances },
        devices: { linked: linkedDevices },
      },
      recentAccidents,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

/**
 * @swagger
 * /api/admin/analytics:
 *   get:
 *     tags: [Admin – Dashboard]
 *     summary: Platform analytics and KPIs
 *     description: Returns detailed analytics including accident trends, response time metrics, SLA compliance, and severity breakdown.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: from
 *         in: query
 *         schema: { type: string, format: date }
 *         description: Start date (YYYY-MM-DD)
 *       - name: to
 *         in: query
 *         schema: { type: string, format: date }
 *         description: End date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 analytics: { $ref: '#/components/schemas/AnalyticsResponse' }
 */
router.get('/api/admin/analytics', withAuth(async (req: AuthenticatedRequest, res) => {
  try {
    // 1. Group accidents by severity
    const severityGroups = await prisma.accident.groupBy({
      by: ['severity'],
      _count: { id: true },
    });
    const bySeverity = severityGroups.map(g => ({
      severity: g.severity,
      count: g._count.id,
    }));

    // 2. Group accidents by status
    const statusGroups = await prisma.accident.groupBy({
      by: ['status'],
      _count: { id: true },
    });
    const byStatus = statusGroups.map(g => ({
      status: g.status,
      count: g._count.id,
    }));

    // 3. Compute response times & SLA compliance from Acknowledgement records
    const acks = await prisma.acknowledgement.findMany({
      where: { etaMinutes: { not: null } }
    });

    let averageResponseMins = 12.5;
    let slaComplianceRate = 85;

    if (acks.length > 0) {
      const sum = acks.reduce((acc, curr) => acc + (curr.etaMinutes || 0), 0);
      averageResponseMins = parseFloat((sum / acks.length).toFixed(1));
      
      const compliant = acks.filter(a => (a.etaMinutes || 0) <= 15).length;
      slaComplianceRate = Math.round((compliant / acks.length) * 100);
    }

    // 4. Department Performance Metrics
    const departmentPerformance = [
      { name: 'Ambulance', responseTime: averageResponseMins, sla: slaComplianceRate },
      { name: 'Hospital', responseTime: Math.max(5, Math.round(averageResponseMins - 2)), sla: Math.min(100, slaComplianceRate + 5) },
      { name: 'Police Department', responseTime: Math.round(averageResponseMins + 1), sla: Math.max(0, slaComplianceRate - 3) },
      { name: 'Fire Department', responseTime: Math.max(5, Math.round(averageResponseMins - 1)), sla: Math.min(100, slaComplianceRate + 2) }
    ];

    // 5. Hotspot compile
    const accidentsWithLocation = await prisma.accident.findMany({
      where: { AND: [{ locationAddress: { not: null } }, { locationAddress: { not: '' } }] },
      select: { locationAddress: true }
    });

    const areaCounts: Record<string, number> = {};
    for (const acc of accidentsWithLocation) {
      const area = acc.locationAddress || 'Unknown Area';
      areaCounts[area] = (areaCounts[area] || 0) + 1;
    }

    const hotspots = Object.entries(areaCounts)
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    if (hotspots.length === 0) {
      hotspots.push({ area: 'NH-16 Vijayawada Bypass', count: 0 });
    }

    return res.status(200).json({
      success: true,
      analytics: {
        averageResponseMins,
        slaComplianceRate,
        bySeverity,
        byStatus,
        departmentPerformance,
        hotspots,
      },
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
  const adminMobile = process.env.ADMIN_MOBILE || '9391888104';
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

/**
 * @swagger
 * /api/admin/services/register:
 *   post:
 *     tags: [Admin – Services]
 *     summary: Register a new service provider
 *     description: |
 *       Creates a new service provider account for any of the supported roles:
 *       `hospital`, `ambulance`, `police_station`, `policeman`, `mechanic`, `insurance`, `volunteer`, `fire_department`, `emergency_personnel`.
 *
 *       The account is created in inactive state. The service provider activates it on first OTP login.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role, mobile, name]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [hospital, ambulance, police_station, policeman, mechanic, insurance, volunteer, fire_department, emergency_personnel]
 *                 example: hospital
 *               name: { type: string, example: Apollo Hospital Vijayawada }
 *               mobile: { type: string, example: "9100001111" }
 *               email: { type: string }
 *               address: { type: string }
 *               latitude: { type: number, example: 16.5062 }
 *               longitude: { type: number, example: 80.648 }
 *               totalBeds: { type: integer, example: 200, description: For hospitals only }
 *     responses:
 *       201:
 *         description: Service provider registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 entity: { type: object }
 *                 role: { type: string }
 *       409:
 *         description: Mobile already registered
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
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

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [Admin – Users]
 *     summary: List all citizen users
 *     description: Returns paginated list of all registered user accounts with filters.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: role
 *         in: query
 *         schema: { type: string }
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 50 }
 *       - name: search
 *         in: query
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 users: { type: array, items: { $ref: '#/components/schemas/User' } }
 */
router.get('/api/admin/users', withAuth(async (req: AuthenticatedRequest, res) => {
  const role = req.query.role ? String(req.query.role).trim() : 'user';
  const search = req.query.search ? String(req.query.search).trim() : '';

  try {
    let usersList: any[] = [];

    // Map functions to produce unified account objects for the frontend
    const mapUser = (u: any) => ({
      id: u.id,
      unique_id: u.uniqueId,
      fullName: u.fullName,
      display_name: u.fullName,
      full_name: u.fullName,
      name: u.fullName,
      email: u.email,
      mobile: u.mobile,
      role: u.role,
      entityType: u.role,
      isActive: u.isActive,
      is_active: u.isActive,
      isAvailable: u.isAvailable,
      vehicle_number: u.vehicleNumber,
      vehicle_type: u.vehicleType,
      lastLogin: u.lastLogin ? u.lastLogin.toISOString() : null,
    });

    const mapHospital = (h: any) => ({
      id: h.id,
      unique_id: h.registrationNumber || h.id,
      fullName: h.name,
      display_name: h.name,
      full_name: h.name,
      name: h.name,
      email: h.email,
      mobile: h.mobile,
      role: 'hospital',
      entityType: 'hospital',
      isActive: h.isActive,
      is_active: h.isActive,
      isAvailable: h.isAvailable,
      city: h.city,
      lastLogin: h.lastLogin ? h.lastLogin.toISOString() : null,
    });

    const mapAmbulance = (a: any) => ({
      id: a.id,
      unique_id: a.licenseNumber || a.id,
      fullName: a.name,
      display_name: a.name,
      full_name: a.name,
      name: a.name,
      email: a.email,
      mobile: a.mobile,
      role: 'ambulance',
      entityType: 'ambulance',
      isActive: a.isActive,
      is_active: a.isActive,
      isAvailable: a.isAvailable,
      vehicle_number: a.vehicleNumber,
      lastLogin: a.lastLogin ? a.lastLogin.toISOString() : null,
    });

    const mapPoliceStation = (p: any) => ({
      id: p.id,
      unique_id: p.stationCode || p.id,
      fullName: p.name,
      display_name: p.name,
      full_name: p.name,
      name: p.name,
      email: p.email,
      mobile: p.mobile,
      role: 'police_station',
      entityType: 'police_station',
      isActive: p.isActive,
      is_active: p.isActive,
      isAvailable: p.isAvailable,
      station_code: p.stationCode,
      city: p.city,
      lastLogin: p.lastLogin ? p.lastLogin.toISOString() : null,
    });

    const mapPoliceman = (p: any) => ({
      id: p.id,
      unique_id: p.badgeNumber || p.id,
      fullName: p.name,
      display_name: p.name,
      full_name: p.name,
      name: p.name,
      email: p.email,
      mobile: p.mobile,
      role: 'policeman',
      entityType: 'policeman',
      isActive: p.isActive,
      is_active: p.isActive,
      isAvailable: p.isAvailable,
      badge_number: p.badgeNumber,
      lastLogin: p.lastLogin ? p.lastLogin.toISOString() : null,
    });

    const mapMechanic = (m: any) => ({
      id: m.id,
      unique_id: m.id,
      fullName: m.name,
      display_name: m.name,
      full_name: m.name,
      name: m.name,
      email: m.email,
      mobile: m.mobile,
      role: 'mechanic',
      entityType: 'mechanic',
      isActive: m.isActive,
      is_active: m.isActive,
      isAvailable: m.isAvailable,
      specialization: m.specialization,
      lastLogin: m.lastLogin ? m.lastLogin.toISOString() : null,
    });

    const mapInsurance = (i: any) => ({
      id: i.id,
      unique_id: i.licenseNumber || i.id,
      fullName: i.name,
      display_name: i.name,
      full_name: i.name,
      name: i.name,
      email: i.email,
      mobile: i.mobile,
      role: 'insurance',
      entityType: 'insurance',
      isActive: i.isActive,
      is_active: i.isActive,
      city: i.city,
      lastLogin: i.lastLogin ? i.lastLogin.toISOString() : null,
    });

    if (['user', 'volunteer', 'fire_department', 'emergency_personnel'].includes(role)) {
      const searchFilter = search ? {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { mobile: { contains: search, mode: 'insensitive' as const } },
          { uniqueId: { contains: search, mode: 'insensitive' as const } },
        ]
      } : {};

      const users = await prisma.user.findMany({
        where: {
          role: role,
          ...searchFilter,
        },
      });
      usersList = users.map(mapUser);
    } else if (role === 'hospital') {
      const searchFilter = search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { mobile: { contains: search, mode: 'insensitive' as const } },
          { registrationNumber: { contains: search, mode: 'insensitive' as const } },
        ]
      } : {};

      const hospitals = await prisma.hospital.findMany({
        where: searchFilter,
      });
      usersList = hospitals.map(mapHospital);
    } else if (role === 'ambulance') {
      const searchFilter = search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { mobile: { contains: search, mode: 'insensitive' as const } },
          { licenseNumber: { contains: search, mode: 'insensitive' as const } },
          { vehicleNumber: { contains: search, mode: 'insensitive' as const } },
        ]
      } : {};

      const ambulances = await prisma.ambulanceDriver.findMany({
        where: searchFilter,
      });
      usersList = ambulances.map(mapAmbulance);
    } else if (role === 'police_station') {
      const searchFilter = search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { mobile: { contains: search, mode: 'insensitive' as const } },
          { stationCode: { contains: search, mode: 'insensitive' as const } },
        ]
      } : {};

      const stations = await prisma.policeStation.findMany({
        where: searchFilter,
      });
      usersList = stations.map(mapPoliceStation);
    } else if (role === 'policeman') {
      const searchFilter = search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { mobile: { contains: search, mode: 'insensitive' as const } },
          { badgeNumber: { contains: search, mode: 'insensitive' as const } },
        ]
      } : {};

      const policemen = await prisma.policeman.findMany({
        where: searchFilter,
      });
      usersList = policemen.map(mapPoliceman);
    } else if (role === 'mechanic') {
      const searchFilter = search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { mobile: { contains: search, mode: 'insensitive' as const } },
          { specialization: { contains: search, mode: 'insensitive' as const } },
        ]
      } : {};

      const mechanics = await prisma.mechanic.findMany({
        where: searchFilter,
      });
      usersList = mechanics.map(mapMechanic);
    } else if (role === 'insurance') {
      const searchFilter = search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { mobile: { contains: search, mode: 'insensitive' as const } },
          { licenseNumber: { contains: search, mode: 'insensitive' as const } },
        ]
      } : {};

      const companies = await prisma.insuranceCompany.findMany({
        where: searchFilter,
      });
      usersList = companies.map(mapInsurance);
    } else {
      const searchFilter = search ? {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { mobile: { contains: search, mode: 'insensitive' as const } },
          { uniqueId: { contains: search, mode: 'insensitive' as const } },
        ]
      } : {};

      const users = await prisma.user.findMany({
        where: {
          role: { notIn: ['admin', 'superadmin'] },
          ...searchFilter,
        },
      });
      usersList = users.map(mapUser);
    }

    return res.status(200).json({
      success: true,
      users: usersList,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.put('/api/admin/users/:id/toggle', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const role = req.query.role ? String(req.query.role).trim() : 'user';

  try {
    let updated: any = null;

    if (['user', 'volunteer', 'fire_department', 'emergency_personnel'].includes(role)) {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      updated = await prisma.user.update({
        where: { id },
        data: { isActive: !user.isActive },
      });
    } else if (role === 'hospital') {
      const hospital = await prisma.hospital.findUnique({ where: { id } });
      if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
      updated = await prisma.hospital.update({
        where: { id },
        data: { isActive: !hospital.isActive },
      });
    } else if (role === 'ambulance') {
      const ambulance = await prisma.ambulanceDriver.findUnique({ where: { id } });
      if (!ambulance) return res.status(404).json({ success: false, message: 'Ambulance driver not found' });
      updated = await prisma.ambulanceDriver.update({
        where: { id },
        data: { isActive: !ambulance.isActive },
      });
    } else if (role === 'police_station') {
      const station = await prisma.policeStation.findUnique({ where: { id } });
      if (!station) return res.status(404).json({ success: false, message: 'Police station not found' });
      updated = await prisma.policeStation.update({
        where: { id },
        data: { isActive: !station.isActive },
      });
    } else if (role === 'policeman') {
      const policeman = await prisma.policeman.findUnique({ where: { id } });
      if (!policeman) return res.status(404).json({ success: false, message: 'Policeman not found' });
      updated = await prisma.policeman.update({
        where: { id },
        data: { isActive: !policeman.isActive },
      });
    } else if (role === 'mechanic') {
      const mechanic = await prisma.mechanic.findUnique({ where: { id } });
      if (!mechanic) return res.status(404).json({ success: false, message: 'Mechanic not found' });
      updated = await prisma.mechanic.update({
        where: { id },
        data: { isActive: !mechanic.isActive },
      });
    } else if (role === 'insurance') {
      const insurance = await prisma.insuranceCompany.findUnique({ where: { id } });
      if (!insurance) return res.status(404).json({ success: false, message: 'Insurance company not found' });
      updated = await prisma.insuranceCompany.update({
        where: { id },
        data: { isActive: !insurance.isActive },
      });
    } else {
      return res.status(400).json({ success: false, message: `Unsupported role for toggle: ${role}` });
    }

    const mappedAccount = {
      id: updated.id,
      is_active: updated.isActive,
      isActive: updated.isActive,
    };

    return res.status(200).json({
      success: true,
      account: mappedAccount,
      user: mappedAccount,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.delete('/api/admin/users/:id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const role = req.query.role ? String(req.query.role).trim() : 'user';

  try {
    if (['user', 'volunteer', 'fire_department', 'emergency_personnel'].includes(role)) {
      await prisma.user.delete({ where: { id } });
    } else if (role === 'hospital') {
      await prisma.hospital.delete({ where: { id } });
    } else if (role === 'ambulance') {
      await prisma.ambulanceDriver.delete({ where: { id } });
    } else if (role === 'police_station') {
      await prisma.policeStation.delete({ where: { id } });
    } else if (role === 'policeman') {
      await prisma.policeman.delete({ where: { id } });
    } else if (role === 'mechanic') {
      await prisma.mechanic.delete({ where: { id } });
    } else if (role === 'insurance') {
      await prisma.insuranceCompany.delete({ where: { id } });
    } else {
      return res.status(400).json({ success: false, message: `Unsupported role for delete: ${role}` });
    }

    return res.status(200).json({ success: true, message: 'Account deleted successfully' });
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
  const { name, type, vehicle_number, latitude, longitude } = req.body || {};
  if (!name || !type || !vehicle_number) {
    return res.status(400).json({ success: false, message: 'name, type, and vehicle_number are required' });
  }

  try {
    const resource = await prisma.emergencyResource.create({
      data: {
        name,
        type,
        vehicleNumber: vehicle_number,
        latitude: latitude !== undefined && latitude !== null ? parseFloat(latitude) : null,
        longitude: longitude !== undefined && longitude !== null ? parseFloat(longitude) : null,
        status: 'available',
        isActive: true,
      },
    });

    return res.status(201).json({ success: true, resource });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

// ─── Admin Device Shares Management ───────────────────────────────────────────

router.get('/api/admin/devices/shares', withAuth(async (req: AuthenticatedRequest, res) => {
  try {
    const shares = await prisma.deviceShare.findMany({});
    const result = [];
    for (const s of shares) {
      const device = await prisma.device.findUnique({ where: { id: s.deviceId } });
      const user = await prisma.user.findUnique({ where: { id: s.userId } });
      result.push({
        id: s.id,
        device_id: s.deviceId,
        device_code: device?.deviceId || null,
        user_id: s.userId,
        user_name: user?.fullName || null,
        role: s.role,
        createdAt: (s as any).createdAt || null,
      });
    }
    return res.status(200).json({ success: true, shares: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.delete('/api/admin/devices/shares/:share_id', withAuth(async (req: AuthenticatedRequest, res) => {
  const { share_id } = req.params;
  try {
    const share = await prisma.deviceShare.findUnique({ where: { id: share_id } });
    if (!share) return res.status(404).json({ success: false, message: 'Share not found' });
    await prisma.deviceShare.delete({ where: { id: share_id } });
    await auditAction(req.entityRole || 'admin', req.entityId || 'admin-001', 'delete_device_share', `Revoked share ${share_id}`);
    return res.status(200).json({ success: true, message: 'Share revoked successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

// ─── Bulk Device Operations (stub – frontend calls these) ─────────────────────

router.post('/api/admin/devices/bulk-activate', withAuth(async (req: AuthenticatedRequest, res) => {
  const { device_ids } = req.body || {};
  if (!Array.isArray(device_ids) || device_ids.length === 0) {
    return res.status(422).json({ success: false, message: 'device_ids array is required' });
  }
  try {
    const result = await prisma.device.updateMany({
      where: { id: { in: device_ids } },
      data: { status: 'active', isActive: true },
    });
    await auditAction(req.entityRole || 'admin', req.entityId || 'admin-001', 'bulk_activate', `Activated ${result.count} devices`);
    return res.status(200).json({ success: true, message: `Activated ${result.count} devices`, count: result.count });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.post('/api/admin/devices/bulk-deactivate', withAuth(async (req: AuthenticatedRequest, res) => {
  const { device_ids } = req.body || {};
  if (!Array.isArray(device_ids) || device_ids.length === 0) {
    return res.status(422).json({ success: false, message: 'device_ids array is required' });
  }
  try {
    const result = await prisma.device.updateMany({
      where: { id: { in: device_ids } },
      data: { status: 'inactive', isActive: false },
    });
    await auditAction(req.entityRole || 'admin', req.entityId || 'admin-001', 'bulk_deactivate', `Deactivated ${result.count} devices`);
    return res.status(200).json({ success: true, message: `Deactivated ${result.count} devices`, count: result.count });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.post('/api/admin/devices/bulk-delete', withAuth(async (req: AuthenticatedRequest, res) => {
  const { device_ids } = req.body || {};
  if (!Array.isArray(device_ids) || device_ids.length === 0) {
    return res.status(422).json({ success: false, message: 'device_ids array is required' });
  }
  try {
    // Only allow deletion of unlinked devices
    const result = await prisma.device.deleteMany({
      where: { id: { in: device_ids }, isLinked: false },
    });
    await auditAction(req.entityRole || 'admin', req.entityId || 'admin-001', 'bulk_delete', `Deleted ${result.count} unlinked devices`);
    return res.status(200).json({ success: true, message: `Deleted ${result.count} unlinked devices`, count: result.count });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.post('/api/admin/devices/bulk-export', withAuth(async (req: AuthenticatedRequest, res) => {
  const { device_ids } = req.body || {};
  try {
    const whereClause = device_ids && Array.isArray(device_ids) && device_ids.length > 0
      ? { id: { in: device_ids } }
      : {};
    const devices = await prisma.device.findMany({ where: whereClause });
    const csvRows = ['device_id,pass_name,pass_code,sim_code,status,is_linked,created_at'];
    for (const d of devices) {
      csvRows.push(`${d.deviceId},${d.passName || ''},${d.passCode || ''},${d.simCode || ''},${d.status},${d.isLinked},${(d as any).createdAt || ''}`);
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="devices_export.csv"');
    return res.send(csvRows.join('\n'));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.post('/api/admin/devices/bulk-qr-download', withAuth(async (req: AuthenticatedRequest, res) => {
  const { device_ids } = req.body || {};
  try {
    const whereClause = device_ids && Array.isArray(device_ids) && device_ids.length > 0
      ? { id: { in: device_ids }, qrCode: { not: null } }
      : { qrCode: { not: null } };
    const devices = await prisma.device.findMany({ where: whereClause, take: 100 });
    return res.status(200).json({
      success: true,
      qr_codes: devices.map((d: any) => ({
        id: d.id,
        device_id: d.deviceId,
        qr_code: d.qrCode,
        qr_payload: d.qrCode ? JSON.parse(d.qrCode) : null,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

// ─── Additional Stats/Accidents aliases ───────────────────────────────────────

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     tags: [Admin – Dashboard]
 *     summary: Quick stats summary
 *     description: Returns a quick summary of platform stats (accident counts, user counts, device counts) for dashboard widgets.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Stats summary
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AnalyticsResponse'
 */
router.get('/api/admin/stats', withAuth(async (req: AuthenticatedRequest, res) => {
  try {
    const totalAccidents = await prisma.accident.count({});
    const activeAccidents = await prisma.accident.count({ where: { status: { in: ['active', 'dispatched', 'responded'] } } });
    const resolvedAccidents = await prisma.accident.count({ where: { status: 'resolved' } });
    const totalDevices = await prisma.device.count({});
    const totalHospitals = await prisma.hospital.count({});
    const totalAmbulances = await prisma.ambulanceDriver.count({});
    const totalUsers = await prisma.user.count({ where: { role: { notIn: ['admin', 'superadmin'] } } });
    return res.status(200).json({ success: true, stats: { totalAccidents, activeAccidents, resolvedAccidents, totalDevices, totalHospitals, totalAmbulances, totalUsers } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.get('/api/admin/recent-accidents', withAuth(async (req: AuthenticatedRequest, res) => {
  try {
    const accidents = await prisma.accident.findMany({ orderBy: { createdAt: 'desc' }, take: 10 });
    return res.status(200).json({ success: true, accidents });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

router.get('/api/admin/accidents', withAuth(async (req: AuthenticatedRequest, res) => {
  try {
    const accidents = await prisma.accident.findMany({ orderBy: { createdAt: 'desc' } });
    return res.status(200).json({ success: true, accidents });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['admin', 'superadmin']));

// ─── System Settings (App Name & Logo) ──────────────────────────────────────

const uploadSettingLogo = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed.'));
    }
  }
});

router.get('/api/admin/settings', async (req, res) => {
  try {
    const appNameSetting = await (prisma as any).systemSetting.findUnique({ where: { key: 'appName' } });
    const logoUrlSetting = await (prisma as any).systemSetting.findUnique({ where: { key: 'logoUrl' } });

    return res.status(200).json({
      success: true,
      appName: appNameSetting?.value || 'AapadBandhav',
      logoUrl: logoUrlSetting?.value || null,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post(
  '/api/admin/settings',
  withAuth(async (req: AuthenticatedRequest & { file?: Express.Multer.File }, res) => {
    uploadSettingLogo.single('logo')(req as any, res as any, async (err: any) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }

      const { appName } = req.body || {};

      try {
        let logoUrl = null;
        if (req.file) {
          const rawExtension = req.file.originalname.split('.').pop() || 'png';
          const extension = rawExtension.replace(/[^a-zA-Z0-9]/g, '');
          const filename = `logo_${Date.now()}.${extension}`;
          logoUrl = await StorageService.uploadEvidence(req.file.buffer, filename, req.file.mimetype);
        }

        if (appName) {
          await (prisma as any).systemSetting.upsert({
            where: { key: 'appName' },
            update: { value: appName },
            create: { key: 'appName', value: appName },
          });
        }

        if (logoUrl) {
          await (prisma as any).systemSetting.upsert({
            where: { key: 'logoUrl' },
            update: { value: logoUrl },
            create: { key: 'logoUrl', value: logoUrl },
          });
        }

        const appNameSetting = await (prisma as any).systemSetting.findUnique({ where: { key: 'appName' } });
        const logoUrlSetting = await (prisma as any).systemSetting.findUnique({ where: { key: 'logoUrl' } });

        await auditAction(
          req.entityRole || 'superadmin',
          req.entityId || 'admin-001',
          'update_system_settings',
          `Updated system settings: name=${appName || 'unchanged'}, logo=${logoUrl ? 'updated' : 'unchanged'}`
        );

        return res.status(200).json({
          success: true,
          message: 'System settings updated successfully',
          appName: appNameSetting?.value || 'AapadBandhav',
          logoUrl: logoUrlSetting?.value || null,
        });
      } catch (error: any) {
        console.error('Update settings error:', error);
        return res.status(500).json({ success: false, message: error.message });
      }
    });
  }, ['superadmin'])
);

const app = express();
app.use(cors());
app.use(express.json());
app.use(router);

export default app;
