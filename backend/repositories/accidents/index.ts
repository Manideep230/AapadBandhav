import prisma from '../../config/db';

export class AccidentRepository {
  static async findAll(take: number = 100) {
    return prisma.accident.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  static async findById(id: string) {
    return prisma.accident.findUnique({
      where: { id },
    });
  }

  static async findByCode(accidentCode: string) {
    return prisma.accident.findUnique({
      where: { accidentCode },
    });
  }

  static async findByUserId(userId: string) {
    return prisma.accident.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async findActiveInLast5Minutes(userId: string, fiveMinsAgo: Date) {
    return prisma.accident.findFirst({
      where: {
        userId,
        status: { in: ['active', 'dispatched', 'responded'] },
        createdAt: { gte: fiveMinsAgo },
      },
    });
  }

  static async create(data: any) {
    return prisma.accident.create({ data });
  }

  static async update(id: string, data: any) {
    return prisma.accident.update({
      where: { id },
      data,
    });
  }

  // Status Logs
  static async createStatusLog(data: any) {
    return prisma.accidentStatusLog.create({ data });
  }

  static async findStatusLogs(accidentId: string) {
    return prisma.accidentStatusLog.findMany({
      where: { accidentId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Field Reports
  static async findReport(accidentId: string, responderId?: string) {
    if (responderId) {
      return prisma.accidentReport.findFirst({
        where: { accidentId, responderId },
      });
    }
    return prisma.accidentReport.findFirst({
      where: { accidentId },
    });
  }

  static async createReport(data: any) {
    return prisma.accidentReport.create({ data });
  }

  static async updateReport(id: string, data: any) {
    return prisma.accidentReport.update({
      where: { id },
      data,
    });
  }
}
