import { Request } from 'express';

export interface TokenPayload {
  id: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: any;
  entityRole?: string;
  entityId?: string;
}
