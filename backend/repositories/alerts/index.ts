import prisma from '../../config/db';

export class AlertRepository {
  static async findById(id: string) {
    return prisma.alert.findUnique({
      where: { id },
    });
  }

  static async findByAccidentId(accidentId: string) {
    return prisma.alert.findMany({
      where: { accidentId },
    });
  }

  static async findByRecipient(recipientId: string, recipientType: string) {
    return prisma.alert.findMany({
      where: { recipientId, recipientType },
    });
  }

  static async findAlertByAccidentAndRecipient(accidentId: string, recipientId: string, recipientType: string) {
    return prisma.alert.findFirst({
      where: { accidentId, recipientId, recipientType },
    });
  }

  static async create(data: any) {
    return prisma.alert.create({ data });
  }

  static async update(id: string, data: any) {
    return prisma.alert.update({
      where: { id },
      data,
    });
  }

  // Acknowledgements
  static async createAcknowledgement(data: any) {
    return prisma.acknowledgement.create({ data });
  }

  static async findAcknowledgements(accidentId: string) {
    return prisma.acknowledgement.findMany({
      where: { accidentId },
      orderBy: { acknowledgedAt: 'desc' },
    });
  }

  // Emergency Resources
  static async findResourcesByAssignment(accidentId: string) {
    return prisma.emergencyResource.findMany({
      where: { currentAssignmentId: accidentId },
    });
  }

  static async updateResource(id: string, data: any) {
    return prisma.emergencyResource.update({
      where: { id },
      data,
    });
  }
}
