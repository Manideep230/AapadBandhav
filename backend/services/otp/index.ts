import crypto from 'crypto';
import { sha256 } from '../../utils/crypto';
import { UserRepository } from '../../repositories/users';
import { SMSService } from '../sms';
 
function isDemoMobileNumber(mobile: string): boolean {
  const clean = mobile.replace(/\D/g, '').slice(-10);
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  if (
    clean.startsWith('990000') ||
    clean.startsWith('930000') ||
    clean.startsWith('940000') ||
    clean.startsWith('950000') ||
    clean.startsWith('960000') ||
    clean.startsWith('970000') ||
    clean.startsWith('980000') ||
    clean.startsWith('910000')
  ) {
    return true;
  }
  const demoNumbers = ['9998887776', '9391888104', '9998881111'];
  return demoNumbers.includes(clean);
}

export class OTPService {
  static async sendOTP(mobile: string): Promise<{ success: boolean; message: string; otp?: string }> {
    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
    // Check rate limit (30s)
    const lastVerification = await UserRepository.findOTPVerification(cleanMobile);
    if (lastVerification && process.env.NODE_ENV !== 'test') {
      const timeElapsed = (new Date().getTime() - new Date(lastVerification.createdAt).getTime()) / 1000;
      if (timeElapsed < 30) {
        throw new Error(`Please wait ${Math.ceil(30 - timeElapsed)} seconds before requesting a new OTP.`);
      }
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = sha256(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

    await UserRepository.createOTPVerification(cleanMobile, otpHash, expiresAt);

    const msg = `Welcome to NighaTech Global Your OTP for authentication is ${otp} don't share with anybody Thank you`;
    await SMSService.sendSMS(cleanMobile, msg);

    console.log(`🔑 [OTP] Mobile: ${cleanMobile} | OTP: ${otp} | NODE_ENV: ${process.env.NODE_ENV}`);

    const response: { success: boolean; message: string; otp?: string } = {
      success: true,
      message: 'OTP sent successfully',
    };

    if (isDemoMobileNumber(cleanMobile)) {
      response.otp = otp;
    }

    return response;
  }

  static async verifyOTP(mobile: string, otp: string): Promise<{ success: boolean; verificationId: string }> {
    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
    const verification = await UserRepository.findOTPVerification(cleanMobile);

    if (!verification) {
      throw new Error('OTP expired or not requested. Please request a new OTP.');
    }

    if (verification.attempts >= 5) {
      throw new Error('Maximum verification attempts exceeded. Please request a new OTP.');
    }

    // Increment attempts
    await UserRepository.updateOTPAttempts(verification.id, verification.attempts + 1);

    const expectedHash = sha256(otp);
    if (verification.otpHash !== expectedHash) {
      throw new Error('Invalid OTP. Please check and try again.');
    }

    // Mark verified
    await UserRepository.markOTPVerified(verification.id);

    return { success: true, verificationId: verification.id };
  }
}

