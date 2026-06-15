import prisma from '../../config/db';

export class NotificationService {
  static async sendPushNotification(fcmToken: string | null, title: string, body: string, data?: any) {
    // Logging fallback for production/development
    console.log(`🔥 [FCM Push Notification] To token: ${fcmToken || 'None'} | Title: ${title} | Body: ${body}`, data || '');
    return true;
  }

  static async createSystemNotification(userId: string, title: string, message: string, type: string = 'info', data?: any) {
    return prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        data: data || null,
        isRead: false,
      },
    });
  }
}
