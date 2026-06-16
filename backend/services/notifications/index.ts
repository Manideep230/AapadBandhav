import prisma from '../../config/db';
import webpush from 'web-push';

const publicKey = process.env.VAPID_PUBLIC_KEY || 'BNOUYEYKstcUgzjm2pbwBa7yjZ8hkjsgbY-ooInmmiAVWgdpMJZZ9xFiA9C0c02RtD0pDwmOMTrymQqJ0mfe3gQ';
const privateKey = process.env.VAPID_PRIVATE_KEY || 'lFklskiL-FS-HVFgd4L2CDLGFnGxxwR946zLAG0PKtI';

webpush.setVapidDetails(
  'mailto:support@aapadbandhav.in',
  publicKey,
  privateKey
);

export class NotificationService {
  static async sendPushNotification(fcmToken: string | null, title: string, body: string, data?: any) {
    // Keep legacy FCM console logging fallback
    console.log(`🔥 [FCM Push Notification] To token: ${fcmToken || 'None'} | Title: ${title} | Body: ${body}`, data || '');
    return true;
  }

  static async sendBrowserPush(entityId: string, title: string, body: string, data?: any) {
    console.log(`📲 Sending browser push notification to: ${entityId} | Title: ${title}`);
    try {
      const subscriptions = await (prisma as any).pushSubscription.findMany({
        where: { entityId },
      });

      const payload = JSON.stringify({
        title,
        body,
        data: data || {},
      });

      const promises = subscriptions.map((sub: any) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            auth: sub.auth,
            p256dh: sub.p256dh,
          },
        };
        return webpush.sendNotification(pushSubscription, payload)
          .catch((err: any) => {
            console.error('Web Push send error for subscription:', sub.id, err.message);
            if (err.statusCode === 410 || err.statusCode === 404) {
              // Clean up expired/invalid subscription
              return (prisma as any).pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
            }
          });
      });

      await Promise.all(promises);
    } catch (err: any) {
      console.error('Error sending browser push:', err.message);
    }
  }

  static async createSystemNotification(userId: string, title: string, message: string, type: string = 'info', data?: any) {
    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        data: data || null,
        isRead: false,
      },
    });

    // Also deliver browser push notification in real time!
    await this.sendBrowserPush(userId, title, message, data);

    return notification;
  }
}
