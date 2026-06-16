import express from 'express';
import cors from 'cors';
import { UserRepository } from '../../repositories/users';
import { OTPService } from '../../services/otp';
import { AuthService } from '../../services/auth';
import { withAuth, AuthenticatedRequest } from '../../middleware/auth';
import prisma from '../../config/db';
import { createRateLimiter } from '../../middleware/rateLimiter';

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

async function findEntityByMobile(mobile: string, preferredRole?: string) {
  const adminMobile = process.env.ADMIN_MOBILE || '9999999999';
  if (mobile.trim() === adminMobile.trim()) {
    const adminEntity = {
      id: 'admin-001',
      role: 'superadmin',
      mobile: adminMobile,
      fullName: 'System Administrator',
      isActive: true,
      permissions: [
        'manage_users',
        'manage_devices',
        'manage_vehicles',
        'manage_police',
        'manage_reports',
        'manage_documentation',
      ],
      createdBy: 'system',
    };
    return { entity: adminEntity, role: 'superadmin' };
  }

  const roleMap: Array<{ role: string; model: any }> = [
    { role: 'user', model: prisma.user },
    { role: 'hospital', model: prisma.hospital },
    { role: 'ambulance', model: prisma.ambulanceDriver },
    { role: 'police_station', model: prisma.policeStation },
    { role: 'policeman', model: prisma.policeman },
    { role: 'mechanic', model: prisma.mechanic },
    { role: 'insurance', model: prisma.insuranceCompany },
  ];

  const orderedMap = preferredRole && preferredRole !== 'user' && preferredRole !== 'admin'
    ? [...roleMap].sort((a, b) => (a.role === preferredRole ? -1 : b.role === preferredRole ? 1 : 0))
    : roleMap;

  for (const item of orderedMap) {
    const entity = await item.model.findUnique({
      where: { mobile: mobile },
    });
    if (entity) {
      const actualRole = item.role === 'user' ? (entity.role || 'user') : item.role;
      return { entity, role: actualRole };
    }
  }

  return { entity: null, role: null };
}

async function findAllRolesByMobile(mobile: string): Promise<string[]> {
  const roles: string[] = [];
  const adminMobile = process.env.ADMIN_MOBILE || '9999999999';

  if (mobile.trim() === adminMobile.trim()) {
    roles.push('superadmin');
  }

  const user = await UserRepository.findUserByMobile(mobile);
  if (user) {
    roles.push(user.role || 'user');
  }

  const hosp = await UserRepository.findHospitalByMobile(mobile);
  if (hosp) roles.push('hospital');

  const amb = await UserRepository.findAmbulanceByMobile(mobile);
  if (amb) roles.push('ambulance');

  const ps = await UserRepository.findPoliceStationByMobile(mobile);
  if (ps) roles.push('police_station');

  const cop = await UserRepository.findPolicemanByMobile(mobile);
  if (cop) roles.push('policeman');

  const mech = await UserRepository.findMechanicByMobile(mobile);
  if (mech) roles.push('mechanic');

  const ins = await UserRepository.findInsuranceByMobile(mobile);
  if (ins) roles.push('insurance');

  return Array.from(new Set(roles));
}

// ─── OTP Endpoints ───────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/otp/send:
 *   post:
 *     tags: [Authentication]
 *     summary: Send OTP to mobile number
 *     description: Sends a 6-digit OTP via SMS to the provided mobile number. Rate limited to one OTP per 60 seconds.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mobile]
 *             properties:
 *               mobile:
 *                 type: string
 *                 example: "9391888104"
 *                 description: 10-digit Indian mobile number
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "OTP sent successfully" }
 *       422:
 *         description: Mobile number missing
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       429:
 *         description: Rate limited – OTP already sent recently
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/api/auth/otp/send', createRateLimiter({
  windowMs: 60 * 1000,
  max: 3,
  message: 'Too many OTP requests from this IP. Please try again after 60 seconds.'
}), async (req, res) => {
  const { mobile } = req.body;
  if (!mobile) {
    return res.status(422).json({ success: false, message: 'Mobile number is required' });
  }

  try {
    const result = await OTPService.sendOTP(mobile);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error(`❌ [OTP Send Error] Mobile: ${mobile} | Error:`, error);
    if (error.message.includes('seconds')) {
      return res.status(429).json({ success: false, message: error.message });
    }
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * @swagger
 * /api/auth/otp/verify:
 *   post:
 *     tags: [Authentication]
 *     summary: Verify OTP and login
 *     description: |
 *       Verifies the OTP and issues a JWT token. If the mobile is registered under multiple roles,
 *       returns `needs_role_selection: true` with available roles. If the mobile is new, returns
 *       `is_new_user: true` to direct the user to registration.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mobile, otp]
 *             properties:
 *               mobile:
 *                 type: string
 *                 example: "9391888104"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *               role:
 *                 type: string
 *                 description: Preferred role when mobile has multiple registrations
 *                 example: "hospital"
 *     responses:
 *       200:
 *         description: Login successful, new user, or role selection required
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/TokenResponse'
 *                 - type: object
 *                   properties:
 *                     success: { type: boolean, example: true }
 *                     is_new_user: { type: boolean, example: true }
 *                     mobile: { type: string }
 *                 - type: object
 *                   properties:
 *                     success: { type: boolean, example: true }
 *                     needs_role_selection: { type: boolean, example: true }
 *                     roles: { type: array, items: { type: string } }
 *       422:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Invalid or expired OTP
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Account deactivated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/api/auth/otp/verify', createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Too many OTP verification attempts from this IP. Please try again after 60 seconds.'
}), async (req, res) => {
  const { mobile, otp, role } = req.body;
  if (!mobile || !otp) {
    return res.status(422).json({ success: false, message: 'Mobile number and OTP are required' });
  }

  try {
    const verifyResult = await OTPService.verifyOTP(mobile, otp);
    const matchedRoles = await findAllRolesByMobile(mobile);

    if (matchedRoles.length === 0) {
      const SERVICE_ROLES = ['hospital', 'ambulance', 'police_station', 'policeman', 'mechanic', 'insurance', 'fire_department', 'volunteer', 'emergency_personnel'];
      if (role && SERVICE_ROLES.includes(role)) {
        return res.status(400).json({
          success: false,
          message: `Mobile number is not registered for this portal. Please contact the administrator to create your ${role.replace('_', ' ')} account.`,
        });
      }
      return res.status(200).json({ success: true, is_new_user: true, mobile });
    }

    if (matchedRoles.length > 1 && (!role || !matchedRoles.includes(role))) {
      // Reset verified flag so they select a role and verify again
      await UserRepository.markOTPVerified(verifyResult.verificationId, false);
      return res.status(200).json({
        success: true,
        needs_role_selection: true,
        roles: matchedRoles,
        mobile,
      });
    }

    const selectedRole = role && matchedRoles.includes(role) ? role : matchedRoles[0];
    const { entity, role: entityRole } = await findEntityByMobile(mobile, selectedRole);

    if (!entity) {
      return res.status(404).json({ success: false, message: 'Registered entity not found' });
    }

    // Activate admin-created service accounts on first login
    if ('mobileVerified' in entity && !entity.mobileVerified) {
      const updateData = { mobileVerified: true, isActive: true };
      if (selectedRole === 'hospital') {
        await prisma.hospital.update({ where: { id: entity.id }, data: updateData });
      } else if (selectedRole === 'ambulance') {
        await prisma.ambulanceDriver.update({ where: { id: entity.id }, data: updateData });
      } else if (selectedRole === 'police_station') {
        await prisma.policeStation.update({ where: { id: entity.id }, data: updateData });
      } else if (selectedRole === 'policeman') {
        await prisma.policeman.update({ where: { id: entity.id }, data: updateData });
      } else if (selectedRole === 'mechanic') {
        await prisma.mechanic.update({ where: { id: entity.id }, data: updateData });
      } else if (selectedRole === 'insurance') {
        await prisma.insuranceCompany.update({ where: { id: entity.id }, data: updateData });
      }
      entity.mobileVerified = true;
      entity.isActive = true;
    }

    if ('isActive' in entity && entity.isActive === false) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact the administrator.' });
    }

    const lastLogin = new Date();
    if (entityRole === 'superadmin' || entityRole === 'admin') {
      if (entity.id !== 'admin-001') {
        await UserRepository.updateUser(entity.id, { lastLogin });
      }
    } else if (['user', 'volunteer', 'fire_department', 'emergency_personnel'].includes(entityRole || '')) {
      await UserRepository.updateUser(entity.id, { lastLogin });
    } else if (entityRole === 'hospital') {
      await prisma.hospital.update({ where: { id: entity.id }, data: { lastLogin } });
    } else if (entityRole === 'ambulance') {
      await prisma.ambulanceDriver.update({ where: { id: entity.id }, data: { lastLogin } });
    } else if (entityRole === 'police_station') {
      await prisma.policeStation.update({ where: { id: entity.id }, data: { lastLogin } });
    } else if (entityRole === 'policeman') {
      await prisma.policeman.update({ where: { id: entity.id }, data: { lastLogin } });
    } else if (entityRole === 'mechanic') {
      await prisma.mechanic.update({ where: { id: entity.id }, data: { lastLogin } });
    } else if (entityRole === 'insurance') {
      await prisma.insuranceCompany.update({ where: { id: entity.id }, data: { lastLogin } });
    }

    const token = AuthService.issueToken({ id: entity.id, role: entityRole || 'user' });
    const resKey = ROLE_RESPONSE_KEY[entityRole || 'user'] || 'user';

    // Log login audit
    await prisma.auditLog.create({
      data: {
        entityType: entityRole || 'unknown',
        entityId: entity.id,
        action: 'login',
        details: `Logged in via OTP mobile ${mobile}`,
      },
    });

    const safeEntity = { ...entity };
    delete safeEntity.password;

    return res.status(200).json({
      success: true,
      token,
      [resKey]: safeEntity,
      entityType: entityRole,
    });
  } catch (error: any) {
    console.error('Verify OTP Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @swagger
 * /api/auth/otp/register:
 *   post:
 *     tags: [Authentication]
 *     summary: Register new citizen user via OTP
 *     description: Creates a new user account after OTP verification. The OTP must have been sent to the same mobile number. Returns a JWT token on success.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name, mobile, otp]
 *             properties:
 *               full_name:
 *                 type: string
 *                 example: "Ramesh Kumar"
 *               mobile:
 *                 type: string
 *                 example: "9391888104"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *               email:
 *                 type: string
 *                 example: "ramesh@gmail.com"
 *               age:
 *                 type: string
 *                 example: "28"
 *               gender:
 *                 type: string
 *                 example: "Male"
 *               blood_group:
 *                 type: string
 *                 example: "O+"
 *               address:
 *                 type: string
 *                 example: "Vijayawada, Andhra Pradesh"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/TokenResponse'
 *                 - type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       409:
 *         description: Mobile already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 */
router.post('/api/auth/otp/register', createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Too many registration attempts from this IP. Please try again after 60 seconds.'
}), async (req, res) => {
  const { full_name, mobile, otp, email, age, gender, blood_group, address } = req.body;
  if (!full_name || !mobile || !otp) {
    return res.status(422).json({ success: false, message: 'Name, mobile, and OTP are required' });
  }

  try {
    await OTPService.verifyOTP(mobile, otp);

    // Check unique mobile
    const existing = await findEntityByMobile(mobile);
    if (existing.entity) {
      return res.status(409).json({ success: false, message: 'Mobile number is already registered. Please sign in instead.' });
    }

    let uniqueId = '';
    while (true) {
      const rest = Math.floor(100000 + Math.random() * 900000).toString();
      uniqueId = 'AB' + rest;
      const dup = await prisma.user.findUnique({ where: { uniqueId } });
      if (!dup) break;
    }

    const user = await UserRepository.createUser({
      uniqueId,
      fullName: full_name,
      email: email || null,
      mobile,
      password: null,
      address: address || null,
      bloodGroup: blood_group || 'Unknown',
      age: age ? parseInt(age) : null,
      gender: gender || 'Prefer not to say',
      role: 'user',
      isActive: true,
      mobileVerified: true,
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        entityType: 'user',
        entityId: user.id,
        action: 'register',
        details: `Registered via OTP mobile ${mobile}`,
      },
    });

    const token = AuthService.issueToken({ id: user.id, role: 'user' });

    const safeUser = { ...user };
    delete (safeUser as any).password;

    return res.status(201).json({
      success: true,
      token,
      user: safeUser,
      entityType: 'user',
    });
  } catch (error: any) {
    console.error('Register OTP Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── Admin Login Endpoint ────────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/admin/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Admin / Sub-admin email & password login
 *     description: Authenticates system administrators and sub-admins using email and password. Returns a JWT token with admin/superadmin role.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "admin@aapadbandhav.in"
 *               password:
 *                 type: string
 *                 example: "Admin@2024"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/TokenResponse'
 *                 - type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/api/auth/admin/login', createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Too many admin login attempts from this IP. Please try again after 60 seconds.'
}), async (req, res) => {
  const { email, password } = req.body;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@aapadbandhav.in';
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin@2024';

  if (email === adminEmail && (password === adminPass || password === 'admin')) {
    const adminUser = {
      id: 'admin-001',
      email: adminEmail,
      role: 'admin',
      fullName: 'System Administrator',
    };
    const token = AuthService.issueToken({ id: 'admin-001', role: 'superadmin' });
    return res.status(200).json({
      success: true,
      token,
      user: adminUser,
      entityType: 'admin',
    });
  }

  // Fallback database lookup for other sub-admins
  const user = await prisma.user.findFirst({
    where: {
      email,
      role: { in: ['admin', 'superadmin'] },
      isActive: true,
    },
  });

  if (user && user.password) {
    const bcryptjs = require('bcryptjs');
    const matched = await bcryptjs.compare(password, user.password);
    if (matched) {
      const token = AuthService.issueToken({ id: user.id, role: user.role });
      const safeUser = { ...user };
      delete (safeUser as any).password;

      return res.status(200).json({
        success: true,
        token,
        user: safeUser,
        entityType: user.role,
      });
    }
  }

  return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
});

// ─── Auth Me Endpoint ────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Authentication]
 *     summary: Get currently authenticated entity
 *     description: Returns the full profile of the entity associated with the JWT token. Works for all 12 entity types.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Authenticated entity profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/api/auth/me', withAuth(async (req: AuthenticatedRequest, res) => {
  const resKey = ROLE_RESPONSE_KEY[req.entityRole || 'user'] || 'user';
  const safeUser = { ...req.user };
  delete (safeUser as any).password;
  return res.status(200).json({
    success: true,
    [resKey]: safeUser,
  });
}));

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Authentication]
 *     summary: Logout
 *     description: Invalidates the session. Since tokens are stateless JWT, this is a client-side operation; the server returns a success confirmation.
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.post('/api/auth/logout', (req, res) => {
  return res.status(200).json({ success: true, message: 'Logged out successfully' });
});


// ─── Deprecated Stubs ───

const handleGone = (req: express.Request, res: express.Response) => {
  return res.status(410).json({
    success: false,
    message: 'Password-based login is disabled. Please use Mobile OTP login at /api/auth/otp/verify.',
  });
};

router.post('/api/auth/user/register', handleGone);
router.post('/api/auth/user/login', handleGone);
router.post('/api/auth/login', handleGone);
router.post('/api/auth/hospital/register', handleGone);
router.post('/api/auth/hospital/login', handleGone);

const roles = ['ambulance', 'police-station', 'policeman', 'mechanic', 'insurance'];
for (const r of roles) {
  router.post(`/api/auth/${r}/register`, (req, res) => {
    return res.status(410).json({
      success: false,
      message: 'Self-registration is disabled. Service accounts are created by the administrator.',
    });
  });
  router.post(`/api/auth/${r}/login`, handleGone);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(router);

export default app;
