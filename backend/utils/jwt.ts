import jwt from 'jsonwebtoken';
import { TokenPayload } from '../types';

let JWT_SECRET = process.env.JWT_SECRET || '';
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL CONFIGURATION ERROR: JWT_SECRET environment variable is missing in production mode. A secure JWT secret is a required production dependency and must be explicitly configured.');
  } else {
    JWT_SECRET = 'change_this_to_a_minimum_64_char_random_secret_in_production';
  }
}

export function generateToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as TokenPayload;
}
