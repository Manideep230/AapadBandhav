import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from './utils/auth';

const prisma = new PrismaClient();
const router = express.Router();

const ROLE_RESPONSE_KEY: Record<string, string> = {
  hospital: 'hospital',
  ambulance: 'driver',
  police_station: 'station',
  policeman: 'policeman',
  mechanic: 'mechanic',
  insurance: 'company',
  user: 'user',
  admin: 'user',
  superadmin: 'user',
  volunteer: 'user',
  fire_department: 'user',
  emergency_personnel: 'user',
};

function parseProfileValue(field: string, value: any) {
  if (value === undefined) return undefined;
  if (['latitude', 'longitude'].includes(field)) {
    return value !== null && value !== '' ? parseFloat(value) : null;
  }
  if (['age', 'bedCapacity', 'availableBeds', 'bed_capacity', 'available_beds'].includes(field)) {
    return value !== null && value !== '' ? parseInt(value) : null;
  }
  if (field === 'specializations') {
    if (Array.isArray(value)) return value;
    return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
  }
  return value;
}

// ─── Profile GET & PUT ────────────────────────────────────────────────────────

router.get('/api/profile', withAuth(async (req: AuthenticatedRequest, res) => {
  const role = req.entityRole || 'user';
  const responseKey = ROLE_RESPONSE_KEY[role] || 'user';

  const safeProfile = { ...req.user };
  delete (safeProfile as any).password;

  return res.status(200).json({
    success: true,
    entityType: role,
    profile: safeProfile,
    [responseKey]: safeProfile,
  });
}));

router.put('/api/profile', withAuth(async (req: AuthenticatedRequest, res) => {
  const role = req.entityRole || 'user';
  if (role === 'admin' || role === 'superadmin') {
    return res.status(403).json({ success: false, message: 'Admin profile cannot be edited here' });
  }

  const editableFieldsMap: Record<string, string[]> = {
    user: ['fullName', 'mobile', 'address', 'age', 'bloodGroup', 'gender', 'vehicleNumber', 'vehicleType', 'full_name', 'blood_group', 'vehicle_number', 'vehicle_type'],
    hospital: ['name', 'mobile', 'latitude', 'longitude', 'specializations', 'bedCapacity', 'availableBeds', 'registrationNumber', 'city', 'state', 'bed_capacity', 'available_beds', 'registration_number'],
    ambulance: ['name', 'mobile', 'licenseNumber', 'vehicleNumber', 'license_number', 'vehicle_number'],
    police_station: ['name', 'mobile', 'stationCode', 'latitude', 'longitude', 'address', 'city', 'state', 'station_code'],
    policeman: ['name', 'mobile', 'badgeNumber', 'stationId', 'badge_number', 'station_id'],
    mechanic: ['name', 'mobile', 'specialization'],
    insurance: ['name', 'mobile', 'licenseNumber', 'latitude', 'longitude', 'address', 'city', 'license_number'],
  };

  const editableFields = editableFieldsMap[role] || [];
  const body = req.body || {};
  const updateData: any = {};

  for (const field of editableFields) {
    if (body[field] !== undefined) {
      // Handle snake_case to camelCase mappings
      let prismaField = field;
      if (field === 'full_name') prismaField = 'fullName';
      if (field === 'blood_group') prismaField = 'bloodGroup';
      if (field === 'vehicle_number') prismaField = 'vehicleNumber';
      if (field === 'vehicle_type') prismaField = 'vehicleType';
      if (field === 'bed_capacity') prismaField = 'bedCapacity';
      if (field === 'available_beds') prismaField = 'availableBeds';
      if (field === 'registration_number') prismaField = 'registrationNumber';
      if (field === 'license_number') prismaField = 'licenseNumber';
      if (field === 'station_code') prismaField = 'stationCode';
      if (field === 'badge_number') prismaField = 'badgeNumber';
      if (field === 'station_id') prismaField = 'stationId';

      updateData[prismaField] = parseProfileValue(prismaField, body[field]);
    }
  }

  let updatedEntity: any = null;
  const id = req.entityId || '';

  if (role === 'user' || role === 'volunteer' || role === 'fire_department') {
    updatedEntity = await prisma.user.update({ where: { id }, data: updateData });
  } else if (role === 'hospital') {
    updatedEntity = await prisma.hospital.update({ where: { id }, data: updateData });
  } else if (role === 'ambulance') {
    updatedEntity = await prisma.ambulanceDriver.update({ where: { id }, data: updateData });
  } else if (role === 'police_station') {
    updatedEntity = await prisma.policeStation.update({ where: { id }, data: updateData });
  } else if (role === 'policeman') {
    updatedEntity = await prisma.policeman.update({ where: { id }, data: updateData });
  } else if (role === 'mechanic') {
    updatedEntity = await prisma.mechanic.update({ where: { id }, data: updateData });
  } else if (role === 'insurance') {
    updatedEntity = await prisma.insuranceCompany.update({ where: { id }, data: updateData });
  }

  const responseKey = ROLE_RESPONSE_KEY[role] || 'user';
  const safeProfile = { ...updatedEntity };
  delete (safeProfile as any).password;

  return res.status(200).json({
    success: true,
    entityType: role,
    profile: safeProfile,
    [responseKey]: safeProfile,
  });
}));

// ─── Citizen Specific Profile Retrieval & Edit ─────────────────────────────────

router.get('/api/users/profile', withAuth(async (req: AuthenticatedRequest, res) => {
  const userId = req.entityId || '';
  const device = await prisma.device.findFirst({
    where: { ownerId: userId, isLinked: true },
  });
  const contacts = await prisma.emergencyContact.findMany({
    where: { userId },
    orderBy: { priority: 'asc' },
  });

  const safeUser = { ...req.user };
  delete (safeUser as any).password;

  return res.status(200).json({
    success: true,
    user: safeUser,
    device: device ? {
      ...device,
      deviceCode: device.deviceId,
      passcode: device.passCode,
      simCode: device.simCode,
    } : null,
    emergency_contacts: contacts.map((c: any) => ({
      id: c.id,
      user_id: c.userId,
      contact_name: c.contactName,
      mobile: c.mobile,
      relation: c.relation,
      priority: c.priority,
    })),
  });
}, ['user', 'volunteer', 'fire_department']));

router.put('/api/users/profile', withAuth(async (req: AuthenticatedRequest, res) => {
  const userId = req.entityId || '';
  const data = req.body || {};

  const updateData: any = {};
  if (data.full_name !== undefined) updateData.fullName = data.full_name;
  if (data.fullName !== undefined) updateData.fullName = data.fullName;
  if (data.address !== undefined) updateData.address = data.address;
  if (data.age !== undefined) updateData.age = data.age ? parseInt(data.age) : null;
  if (data.vehicle_number !== undefined) updateData.vehicleNumber = data.vehicle_number;
  if (data.vehicleNumber !== undefined) updateData.vehicleNumber = data.vehicleNumber;
  if (data.blood_group !== undefined) updateData.bloodGroup = data.blood_group;
  if (data.bloodGroup !== undefined) updateData.bloodGroup = data.bloodGroup;
  if (data.vehicle_type !== undefined) updateData.vehicleType = data.vehicle_type;
  if (data.vehicleType !== undefined) updateData.vehicleType = data.vehicleType;
  if (data.mobile !== undefined) updateData.mobile = data.mobile;
  if (data.gender !== undefined) updateData.gender = data.gender;

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  const safeUser = { ...updatedUser };
  delete (safeUser as any).password;

  return res.status(200).json({
    success: true,
    user: safeUser,
  });
}, ['user', 'volunteer', 'fire_department']));

// ─── Emergency Contacts CRUD ───────────────────────────────────────────────────

router.get('/api/users/emergency-contacts', withAuth(async (req: AuthenticatedRequest, res) => {
  const userId = req.entityId || '';
  const contacts = await prisma.emergencyContact.findMany({ where: { userId } });
  return res.status(200).json({
    success: true,
    emergency_contacts: contacts.map((c: any) => ({
      id: c.id,
      user_id: c.userId,
      contact_name: c.contactName,
      mobile: c.mobile,
      relation: c.relation,
      priority: c.priority,
    })),
  });
}, ['user', 'volunteer', 'fire_department']));

router.post('/api/users/emergency-contacts', withAuth(async (req: AuthenticatedRequest, res) => {
  const userId = req.entityId || '';
  const { contact_name, contactName, mobile, relation, priority } = req.body || {};
  const name = contactName || contact_name;

  if (!name || !mobile) {
    return res.status(422).json({ success: false, message: 'Name and mobile are required' });
  }

  const contact = await prisma.emergencyContact.create({
    data: {
      userId,
      contactName: name,
      mobile,
      relation: relation || null,
      priority: priority ? parseInt(priority) : 1,
    },
  });

  return res.status(201).json({
    success: true,
    emergency_contact: {
      id: contact.id,
      user_id: contact.userId,
      contact_name: contact.contactName,
      mobile: contact.mobile,
      relation: contact.relation,
      priority: contact.priority,
    },
  });
}, ['user', 'volunteer', 'fire_department']));

router.put('/api/users/emergency-contacts/:id', withAuth(async (req: AuthenticatedRequest, res) => {
  const userId = req.entityId || '';
  const contactId = req.params.id;
  const { contact_name, contactName, mobile, relation, priority } = req.body || {};
  const name = contactName || contact_name;

  const contact = await prisma.emergencyContact.findFirst({
    where: { id: contactId, userId },
  });

  if (!contact) {
    return res.status(404).json({ success: false, message: 'Contact not found' });
  }

  const updateData: any = {};
  if (name !== undefined) updateData.contactName = name;
  if (mobile !== undefined) updateData.mobile = mobile;
  if (relation !== undefined) updateData.relation = relation;
  if (priority !== undefined) updateData.priority = priority ? parseInt(priority) : contact.priority;

  const updated = await prisma.emergencyContact.update({
    where: { id: contactId },
    data: updateData,
  });

  return res.status(200).json({
    success: true,
    emergency_contact: {
      id: updated.id,
      user_id: updated.userId,
      contact_name: updated.contactName,
      mobile: updated.mobile,
      relation: updated.relation,
      priority: updated.priority,
    },
  });
}, ['user', 'volunteer', 'fire_department']));

router.delete('/api/users/emergency-contacts/:id', withAuth(async (req: AuthenticatedRequest, res) => {
  const userId = req.entityId || '';
  const contactId = req.params.id;

  const contact = await prisma.emergencyContact.findFirst({
    where: { id: contactId, userId },
  });

  if (!contact) {
    return res.status(404).json({ success: false, message: 'Contact not found' });
  }

  await prisma.emergencyContact.delete({ where: { id: contactId } });

  return res.status(200).json({
    success: true,
    message: 'Contact deleted successfully',
  });
}, ['user', 'volunteer', 'fire_department']));

const app = express();
app.use(cors());
app.use(express.json());
app.use(router);

export default app;
