import crypto from 'crypto';
import { sha256 } from '../../utils/crypto';
import { UserRepository } from '../../repositories/users';
import { SMSService } from '../sms';
 
export class OTPService {
  static async sendOTP(mobile: string): Promise<{ success: boolean; message: string; otp?: string }> {
    // Check rate limit (30s)
    const lastVerification = await UserRepository.findOTPVerification(mobile);
    if (lastVerification && process.env.NODE_ENV !== 'test') {
      const timeElapsed = (new Date().getTime() - new Date(lastVerification.createdAt).getTime()) / 1000;
      if (timeElapsed < 30) {
        throw new Error(`Please wait ${Math.ceil(30 - timeElapsed)} seconds before requesting a new OTP.`);
      }
    }
 
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = sha256(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins
 
    await UserRepository.createOTPVerification(mobile, otpHash, expiresAt);
 
    const msg = `AapadBandhav Verification Code\n\nYour OTP is: ${otp}\nThis code is valid for 5 minutes. Do not share it.\n\nThank You,\nTeam NighaTech Global Pvt Ltd`;
    await SMSService.sendSMS(mobile, msg);

    console.log(`🔑 [OTP] Mobile: ${mobile} | OTP: ${otp} | NODE_ENV: ${process.env.NODE_ENV}`);

    return {
      success: true,
      message: 'OTP sent successfully',
      otp: otp,
    };
  }

  static async verifyOTP(mobile: string, otp: string): Promise<{ success: boolean; verificationId: string }> {
    const verification = await UserRepository.findOTPVerification(mobile);

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
