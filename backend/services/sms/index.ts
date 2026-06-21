import https from 'https';
import axios from 'axios';
import prisma from '../../config/db';
import { MessageRepository } from '../../repositories/messages';

const agent = new https.Agent({
  rejectUnauthorized: false,
});

export class SMSService {
  static async sendSMS(
    mobile: string,
    message: string,
    accidentId?: string,
    templateId?: string
  ): Promise<boolean> {
    const secret = process.env.SMS_SECRET || 'xledocqmXkNPrTesuqWr';
    const sender = process.env.SMS_SENDER || 'NIGHAI';
    const tempid = templateId || process.env.SMS_TEMPID || '1207174264191607433';
    const route = process.env.SMS_ROUTE || 'TA';
    const msgtype = process.env.SMS_MSGTYPE || '1';
    const url = process.env.SMS_GATEWAY_URL || 'https://43.252.88.250/index.php/smsapi/httpapi/';

    const cleanMobile = mobile ? mobile.replace(/\D/g, '').slice(-10) : '';
    if (!cleanMobile || cleanMobile.length !== 10) {
      console.error(`❌ [SMS Gateway] Invalid mobile number: "${mobile}"`);
      return false;
    }

    let smsLogId: string | null = null;

    if (accidentId) {
      const contact = await prisma.emergencyContact.findFirst({
        where: {
          OR: [
            { mobile: cleanMobile },
            { mobile: mobile },
          ],
        },
      });
      const contactName = contact ? contact.contactName : 'Emergency Contact';

      const log = await MessageRepository.createSMSLog({
        accidentId,
        recipientName: contactName,
        recipientMobile: cleanMobile,
        message: message,
        status: 'sending',
        attempts: 0,
      });
      smsLogId = log.id;
    }

    let success = false;
    let attempts = 0;
    let errorMessage: string | null = null;

    while (attempts < 3 && !success) {
      attempts++;
      try {
        console.log(`📡 [SMS Gateway] Attempt ${attempts} to ${cleanMobile}`);
        const response = await axios.get(url, {
          params: {
            secret,
            sender,
            tempid,
            receiver: cleanMobile,
            route,
            msgtype,
            sms: message,
          },
          httpsAgent: agent,
          timeout: 10000,
        });
        console.log(`📡 [SMS Gateway] Response: ${response.status} - ${String(response.data).substring(0, 200)}`);
        if (response.status === 200) {
          success = true;
        } else {
          errorMessage = `Status ${response.status}: ${response.data}`;
        }
      } catch (error: any) {
        errorMessage = error.message;
        console.error(`❌ [SMS Gateway Exception] To: ${cleanMobile} | Attempt: ${attempts} | Error:`, error.message);
        if (attempts < 3) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }

    if (smsLogId) {
      await prisma.emergencySMSLog.update({
        where: { id: smsLogId },
        data: {
          status: success ? 'sent' : 'failed',
          attempts,
          errorMessage: success ? null : errorMessage,
        },
      });
    }

    return success;
  }
}
export default SMSService;

