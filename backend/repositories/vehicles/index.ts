import prisma from '../../config/db';

export class VehicleRepository {
  static async findAll() {
    return prisma.vehicleInformation.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  static async findById(id: string) {
    return prisma.vehicleInformation.findUnique({
      where: { id },
      include: { user: true, device: true }
    });
  }

  static async findByUserId(userId: string) {
    return prisma.vehicleInformation.findMany({
      where: { userId },
      include: { device: true }
    });
  }

  static async create(data: any) {
    return prisma.vehicleInformation.create({ data });
  }

  static async update(id: string, data: any) {
    return prisma.vehicleInformation.update({
      where: { id },
      data,
    });
  }

  static async delete(id: string) {
    return prisma.vehicleInformation.delete({
      where: { id },
    });
  }
}
