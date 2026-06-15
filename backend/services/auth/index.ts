import { generateToken, verifyToken } from '../../utils/jwt';
import { TokenPayload } from '../../types';

export class AuthService {
  static issueToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
    return generateToken(payload);
  }

  static parseToken(token: string): TokenPayload {
    return verifyToken(token);
  }
}
export default AuthService;
