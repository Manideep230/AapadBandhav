import prisma from '../../config/db';

export class RouteRepository {
  static async findById(id: string) {
    return prisma.route.findUnique({
      where: { id },
    });
  }

  static async findByAccidentId(accidentId: string) {
    return prisma.route.findMany({
      where: { accidentId },
    });
  }

  static async findActiveRoutes(accidentId: string) {
    return prisma.route.findMany({
      where: { accidentId, status: 'active' },
    });
  }

  static async create(data: any) {
    return prisma.route.create({ data });
  }

  static async update(id: string, data: any) {
    return prisma.route.update({
      where: { id },
      data,
    });
  }

  static async completeActiveRoutes(accidentId: string) {
    return prisma.route.updateMany({
      where: { accidentId, status: 'active' },
      data: { status: 'completed' },
    });
  }

  // Live Location
  static async findLatestLiveLocation(entityId: string, entityType: string) {
    return prisma.liveLocation.findFirst({
      where: { entityId, entityType },
      orderBy: { recordedAt: 'desc' },
    });
  }

  static async createLiveLocation(data: any) {
    return prisma.liveLocation.create({ data });
  }
}
