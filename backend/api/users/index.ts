import express from 'express';
import cors from 'cors';
import prisma from '../../config/db';
import { UserRepository } from '../../repositories/users';
import { withAuth, AuthenticatedRequest } from '../../middleware/auth';
import { StorageService } from '../../services/storage';

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

/**
 * @swagger
 * /api/profile:
 *   get:
 *     tags: [Profile]
 *     summary: Get my profile
 *     description: Returns the full profile of the authenticated entity (works for all 12 entity types).
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Entity profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 entityType: { type: string, example: user }
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/api/profile', withAuth(async (req: AuthenticatedRequest, res) => {
  const role = req.entityRole || 'user';
  const responseKey = ROLE_RESPONSE_KEY[role] || 'user';

  const isUserRole = ['user', 'volunteer', 'fire_department', 'admin', 'superadmin'].includes(role);
  const safeProfile = isUserRole ? toSafeUser(req.user) : { ...req.user };
  if (!isUserRole) {
    delete (safeProfile as any).password;
  }

  return res.status(200).json({
    success: true,
    entityType: role,
    profile: safeProfile,
    [responseKey]: safeProfile,
  });
}));

/**
 * @swagger
 * /api/profile:
 *   put:
 *     tags: [Profile]
 *     summary: Update my profile
 *     description: Updates profile fields for the authenticated entity. Accepts any combination of profile fields.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName: { type: string, example: Ramesh Kumar }
 *               email: { type: string, example: ramesh@gmail.com }
 *               address: { type: string }
 *               bloodGroup: { type: string, example: "O+" }
 *               age: { type: integer, example: 28 }
 *               gender: { type: string, example: Male }
 *               latitude: { type: number, example: 16.5062 }
 *               longitude: { type: number, example: 80.648 }
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/api/profile', withAuth(async (req: AuthenticatedRequest, res) => {
  const role = req.entityRole || 'user';

  const editableFieldsMap: Record<string, string[]> = {
    admin: ['fullName', 'mobile', 'full_name', 'profile_photo', 'profilePhoto'],
    superadmin: ['fullName', 'mobile', 'full_name', 'profile_photo', 'profilePhoto'],
    user: ['fullName', 'mobile', 'address', 'age', 'bloodGroup', 'gender', 'vehicleNumber', 'vehicleType', 'full_name', 'blood_group', 'vehicle_number', 'vehicle_type', 'profile_photo', 'profilePhoto'],
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
      if (field === 'profile_photo') prismaField = 'profilePhoto';

      if (prismaField === 'profilePhoto') {
        const val = body[field];
        if (val === null || val === '') {
          updateData.profilePhoto = null;
        } else {
          updateData.profilePhoto = await handleBase64Upload(val);
        }
      } else {
        updateData[prismaField] = parseProfileValue(prismaField, body[field]);
      }
    }
  }

  let updatedEntity: any = null;
  const id = req.entityId || '';

  if (role === 'user' || role === 'volunteer' || role === 'fire_department' || role === 'admin' || role === 'superadmin') {
    updatedEntity = await UserRepository.updateUser(id, updateData);
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
  const isUserRole = ['user', 'volunteer', 'fire_department', 'admin', 'superadmin'].includes(role);
  const safeProfile = isUserRole ? toSafeUser(updatedEntity) : { ...updatedEntity };
  if (!isUserRole) {
    delete (safeProfile as any).password;
  }

  return res.status(200).json({
    success: true,
    entityType: role,
    profile: safeProfile,
    [responseKey]: safeProfile,
  });
}));

// ─── Citizen Specific Profile Retrieval & Edit ─────────────────────────────────

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     tags: [Profile]
 *     summary: Get citizen user profile (alias)
 *     description: Returns profile for user/volunteer/fire_department roles. Alias for GET /api/profile.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/api/users/profile', withAuth(async (req: AuthenticatedRequest, res) => {
  const userId = req.entityId || '';
  const device = await prisma.device.findFirst({
    where: { ownerId: userId, isLinked: true },
  });
  const contacts = await UserRepository.findEmergencyContacts(userId);

  const safeUser = toSafeUser(req.user);

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

/**
 * @swagger
 * /api/users/profile:
 *   put:
 *     tags: [Profile]
 *     summary: Update citizen user profile (alias)
 *     description: Updates user profile. Alias for PUT /api/profile.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName: { type: string }
 *               email: { type: string }
 *               address: { type: string }
 *               bloodGroup: { type: string }
 *               age: { type: integer }
 *               gender: { type: string }
 *     responses:
 *       200:
 *         description: Updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
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
  
  if (data.profile_photo !== undefined) {
    updateData.profilePhoto = data.profile_photo === null || data.profile_photo === '' ? null : await handleBase64Upload(data.profile_photo);
  }
  if (data.profilePhoto !== undefined) {
    updateData.profilePhoto = data.profilePhoto === null || data.profilePhoto === '' ? null : await handleBase64Upload(data.profilePhoto);
  }

  const updatedUser = await UserRepository.updateUser(userId, updateData);

  const safeUser = toSafeUser(updatedUser);

  return res.status(200).json({
    success: true,
    user: safeUser,
  });
}, ['user', 'volunteer', 'fire_department']));

// ─── Emergency Contacts CRUD ───────────────────────────────────────────────────

/**
 * @swagger
 * /api/users/emergency-contacts:
 *   get:
 *     tags: [Emergency Contacts]
 *     summary: List emergency contacts
 *     description: Returns all emergency contacts for the authenticated user.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of emergency contacts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 contacts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/EmergencyContact'
 */
router.get('/api/users/emergency-contacts', withAuth(async (req: AuthenticatedRequest, res) => {
  const userId = req.entityId || '';
  const contacts = await UserRepository.findEmergencyContacts(userId);
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

/**
 * @swagger
 * /api/users/emergency-contacts:
 *   post:
 *     tags: [Emergency Contacts]
 *     summary: Add emergency contact
 *     description: Creates a new emergency contact for the authenticated user.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, mobile, relation]
 *             properties:
 *               name: { type: string, example: Father }
 *               mobile: { type: string, example: "9876543210" }
 *               relation: { type: string, example: Father }
 *     responses:
 *       201:
 *         description: Emergency contact created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 contact:
 *                   $ref: '#/components/schemas/EmergencyContact'
 */
router.post('/api/users/emergency-contacts', withAuth(async (req: AuthenticatedRequest, res) => {
  const userId = req.entityId || '';
  const { contact_name, contactName, mobile, relation, priority } = req.body || {};
  const name = contactName || contact_name;

  if (!name || !mobile) {
    return res.status(422).json({ success: false, message: 'Name and mobile are required' });
  }

  const cleanMobile = mobile.replace(/\D/g, '').slice(-10);

  const contact = await UserRepository.createEmergencyContact(userId, {
    contactName: name,
    mobile: cleanMobile,
    relation: relation || null,
    priority: priority ? parseInt(priority) : 1,
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

/**
 * @swagger
 * /api/users/emergency-contacts/{id}:
 *   put:
 *     tags: [Emergency Contacts]
 *     summary: Update emergency contact
 *     description: Updates an existing emergency contact by ID.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         description: Emergency contact ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               mobile: { type: string }
 *               relation: { type: string }
 *     responses:
 *       200:
 *         description: Contact updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Contact not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/api/users/emergency-contacts/:id', withAuth(async (req: AuthenticatedRequest, res) => {
  const userId = req.entityId || '';
  const contactId = req.params.id;
  const { contact_name, contactName, mobile, relation, priority } = req.body || {};
  const name = contactName || contact_name;

  const contacts = await UserRepository.findEmergencyContacts(userId);
  const contact = contacts.find((c: any) => c.id === contactId);

  if (!contact) {
    return res.status(404).json({ success: false, message: 'Contact not found' });
  }

  const updateData: any = {};
  if (name !== undefined) updateData.contactName = name;
  if (mobile !== undefined) {
    updateData.mobile = mobile.replace(/\D/g, '').slice(-10);
  }
  if (relation !== undefined) updateData.relation = relation;
  if (priority !== undefined) updateData.priority = priority ? parseInt(priority) : contact.priority;

  const updated = await UserRepository.updateEmergencyContact(contactId, updateData);

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

/**
 * @swagger
 * /api/users/emergency-contacts/{id}:
 *   delete:
 *     tags: [Emergency Contacts]
 *     summary: Delete emergency contact
 *     description: Deletes an emergency contact by ID.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         description: Emergency contact ID
 *     responses:
 *       200:
 *         description: Contact deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Contact not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/api/users/emergency-contacts/:id', withAuth(async (req: AuthenticatedRequest, res) => {
  const userId = req.entityId || '';
  const contactId = req.params.id;

  const contacts = await UserRepository.findEmergencyContacts(userId);
  const contact = contacts.find((c: any) => c.id === contactId);

  if (!contact) {
    return res.status(404).json({ success: false, message: 'Contact not found' });
  }

  await UserRepository.deleteEmergencyContact(contactId);

  return res.status(200).json({
    success: true,
    message: 'Contact deleted successfully',
  });
}, ['user', 'volunteer', 'fire_department']));

// ─── Become a Ranger Toggle ───────────────────────────────────────────────────

/**
 * @swagger
 * /api/users/become-ranger:
 *   put:
 *     tags: [Profile]
 *     summary: Toggle Ranger status for the authenticated user
 *     description: |
 *       Enables or disables **Ranger mode** for a regular citizen account.
 *
 *       When `isRanger` is `true`:
 *       - The user is included in emergency alert dispatches alongside registered volunteers.
 *       - They receive push notifications and SMS for nearby accidents.
 *       - They are visible on the live responder map as a Ranger.
 *       - They can accept unlimited alerts (no per-role conflict limit applies).
 *
 *       When `isRanger` is `false`, the user returns to standard citizen mode.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isRanger]
 *             properties:
 *               isRanger:
 *                 type: boolean
 *                 example: true
 *                 description: Set to true to enable Ranger mode, false to disable.
 *     responses:
 *       200:
 *         description: Ranger status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'You are now a Ranger! You will receive emergency alerts.' }
 *                 isRanger: { type: boolean, example: true }
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid request — isRanger must be a boolean
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/api/users/become-ranger', withAuth(async (req: AuthenticatedRequest, res) => {
  const userId = req.entityId || '';
  const { isRanger } = req.body || {};

  if (typeof isRanger !== 'boolean') {
    return res.status(400).json({ success: false, message: 'isRanger must be a boolean' });
  }

  try {
    const updated = await UserRepository.updateUser(userId, { isRanger });
    const safeUser = toSafeUser(updated);
    return res.status(200).json({
      success: true,
      message: isRanger ? 'You are now a Ranger! You will receive emergency alerts.' : 'Ranger mode disabled.',
      user: safeUser,
      isRanger: (updated as any).isRanger ?? isRanger,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}, ['user']));

export function toSafeUser(user: any) {
  if (!user) return user;
  const safe = { ...user };
  delete safe.password;
  
  // Map snake_case equivalents
  safe.unique_id = user.uniqueId;
  safe.full_name = user.fullName;
  safe.profile_photo = user.profilePhoto;
  safe.blood_group = user.bloodGroup;
  safe.vehicle_number = user.vehicleNumber;
  safe.vehicle_type = user.vehicleType;
  safe.is_active = user.isActive;
  safe.is_available = user.isAvailable;
  safe.last_location_lat = user.lastLocationLat;
  safe.last_location_lng = user.lastLocationLng;
  safe.last_seen = user.lastSeen;
  safe.fcm_token = user.fcmToken;
  safe.mobile_verified = user.mobileVerified;
  safe.last_login = user.lastLogin;
  safe.created_by = user.createdBy;
  safe.created_at = user.createdAt;
  safe.updated_at = user.updatedAt;
  safe.is_ranger = user.isRanger ?? false;
  
  return safe;
}

export async function handleBase64Upload(base64Str: string | null | undefined): Promise<string | null> {
  if (!base64Str) return null;
  if (base64Str.startsWith('http') || base64Str.startsWith('/api/uploads')) {
    return base64Str;
  }
  const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    const mimeType = matches[1];
    const fileBuffer = Buffer.from(matches[2], 'base64');
    const extension = mimeType.split('/')[1] || 'png';
    const filename = `profile_${Date.now()}_${Math.floor(Math.random() * 10000)}.${extension}`;
    return await StorageService.uploadEvidence(fileBuffer, filename, mimeType);
  }
  return null;
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(router);

export default app;
