import prisma from '../../config/db';

export class MessageRepository {
  // Chat Messages
  static async findChatMessages(accidentId: string) {
    return prisma.incidentMessage.findMany({
      where: { accidentId },
      orderBy: { createdAt: 'asc' },
    });
  }

  static async createChatMessage(data: any) {
    return prisma.incidentMessage.create({ data });
  }

  // SMS Logs
  static async createSMSLog(data: any) {
    return prisma.emergencySMSLog.create({ data });
  }

  static async findSMSLogs(accidentId?: string) {
    if (accidentId) {
      return prisma.emergencySMSLog.findMany({
        where: { accidentId },
        orderBy: { createdAt: 'desc' },
      });
    }
    return prisma.emergencySMSLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // Audit Logs
  static async createAuditLog(data: any) {
    return prisma.auditLog.create({ data });
  }

  static async findAuditLogs(limit: number = 100) {
    return prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
