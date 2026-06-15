import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { TokenPayload } from '../types';

let JWT_SECRET = process.env.JWT_SECRET || '';
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️ [SECURITY WARNING] JWT_SECRET is not configured in production! Generating a secure random key for this session.');
    JWT_SECRET = crypto.randomBytes(32).toString('hex');
  } else {
    JWT_SECRET = 'change_this_to_a_minimum_64_char_random_secret_in_production';
  }
}

export function generateToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}
