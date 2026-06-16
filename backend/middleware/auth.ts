import { Request, Response } from 'express';
import { verifyToken } from '../utils/jwt';
import prisma from '../config/db';
import { AuthenticatedRequest } from '../types';

export { AuthenticatedRequest };

export function setCorsHeaders(req: Request, res: Response) {
  const origin = req.headers.origin;
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://localhost';
  const allowedOrigins = allowedOriginsEnv.split(',').map(o => o.trim());

  if (origin) {
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0]);
    }
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
}

export function withAuth(
  handler: (req: AuthenticatedRequest, res: Response) => Promise<any>,
  allowedRoles?: string[]
) {
  return async (req: AuthenticatedRequest, res: Response) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    try {
      const decoded = verifyToken(token);
      req.entityId = decoded.id;
      req.entityRole = decoded.role;

      let entity: any = null;

      if (decoded.role === 'admin' || decoded.role === 'superadmin') {
        if (decoded.id === 'admin-001') {
          // Dynamic upsert to ensure admin-001 always exists as a database document
          entity = await prisma.user.findUnique({ where: { id: 'admin-001' } });
          if (!entity) {
            entity = await prisma.user.upsert({
              where: { id: 'admin-001' },
              update: {},
              create: {
                id: 'admin-001',
                uniqueId: 'AD001',
                fullName: 'System Administrator',
                email: process.env.ADMIN_EMAIL || 'admin@aapadbandhav.in',
                mobile: process.env.ADMIN_MOBILE || '9391888104',
                role: 'superadmin',
                isActive: true,
                permissions: [
                  'manage_users',
                  'manage_devices',
                  'manage_vehicles',
                  'manage_police',
                  'manage_reports',
                  'manage_documentation',
                ],
              },
            });
          }
        } else {
          entity = await prisma.user.findFirst({
            where: {
              id: decoded.id,
              role: { in: ['admin', 'superadmin'] },
            },
          });
        }
      } else if (['user', 'volunteer', 'fire_department', 'emergency_personnel'].includes(decoded.role)) {
        entity = await prisma.user.findUnique({ where: { id: decoded.id } });
      } else if (decoded.role === 'hospital') {
        entity = await prisma.hospital.findUnique({ where: { id: decoded.id } });
      } else if (decoded.role === 'ambulance') {
        entity = await prisma.ambulanceDriver.findUnique({ where: { id: decoded.id } });
      } else if (decoded.role === 'police_station') {
        entity = await prisma.policeStation.findUnique({ where: { id: decoded.id } });
      } else if (decoded.role === 'policeman') {
        entity = await prisma.policeman.findUnique({ where: { id: decoded.id } });
      } else if (decoded.role === 'mechanic') {
        entity = await prisma.mechanic.findUnique({ where: { id: decoded.id } });
      } else if (decoded.role === 'insurance') {
        entity = await prisma.insuranceCompany.findUnique({ where: { id: decoded.id } });
      }

      if (!entity) {
        return res.status(401).json({ success: false, message: 'Authentication failed - entity not found' });
      }

      if (entity.isActive === false) {
        return res.status(403).json({ success: false, message: 'Account is deactivated' });
      }

      req.user = entity;

      if (allowedRoles) {
        const hasRole = allowedRoles.includes(decoded.role) || (entity.role && allowedRoles.includes(entity.role));
        if (!hasRole) {
          return res.status(403).json({ success: false, message: 'Access denied' });
        }
      }

      return await handler(req, res);
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired' });
      }
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
  };
}

export function withCors(handler: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    return await handler(req, res);
  };
}
