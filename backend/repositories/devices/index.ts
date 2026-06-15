import prisma from '../../config/db';

export class DeviceRepository {
  static async findAll() {
    return prisma.device.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  static async findById(id: string) {
    return prisma.device.findUnique({
      where: { id },
      include: { owner: true }
    });
  }

  static async findByDeviceId(deviceId: string) {
    return prisma.device.findUnique({
      where: { deviceId },
      include: { owner: true }
    });
  }

  static async findByPassName(passName: string) {
    return prisma.device.findUnique({ where: { passName } });
  }

  static async findByOwnerId(ownerId: string) {
    return prisma.device.findMany({
      where: { ownerId },
    });
  }

  static async findSharedDevices(userId: string) {
    return prisma.deviceShare.findMany({
      where: { userId },
      include: { device: true },
    });
  }

  static async create(data: any) {
    return prisma.device.create({ data });
  }

  static async update(id: string, data: any) {
    return prisma.device.update({
      where: { id },
      data,
    });
  }

  static async updateByDeviceId(deviceId: string, data: any) {
    return prisma.device.update({
      where: { deviceId },
      data,
    });
  }

  static async delete(id: string) {
    return prisma.device.delete({
      where: { id },
    });
  }

  // Device Sharing
  static async findDeviceShare(deviceId: string, userId: string) {
    return prisma.deviceShare.findFirst({
      where: { deviceId, userId },
    });
  }

  static async createShare(data: { deviceId: string; userId: string; role: string }) {
    return prisma.deviceShare.create({ data });
  }

  static async deleteShare(id: string) {
    return prisma.deviceShare.delete({ where: { id } });
  }

  // Rest Segments
  static async findStops(deviceId: string) {
    return prisma.restSegment.findMany({
      where: { deviceId },
      orderBy: { startTime: 'desc' },
      take: 50,
    });
  }

  static async findActiveStop(deviceId: string) {
    return prisma.restSegment.findFirst({
      where: { deviceId, endTime: null },
    });
  }

  static async createStop(data: any) {
    return prisma.restSegment.create({ data });
  }

  static async updateStop(id: string, data: any) {
    return prisma.restSegment.update({
      where: { id },
      data,
    });
  }

  // GPS Speed Logs
  static async findSpeedLogs(deviceId: string, limit: number = 100) {
    return prisma.gPSSpeedLog.findMany({
      where: { deviceId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  static async createSpeedLog(data: any) {
    return prisma.gPSSpeedLog.create({ data });
  }

  // IoT Nodes
  static async createIoTNode(data: any) {
    return prisma.ioTNode.create({ data });
  }

  static async findIoTNodes(deviceId: string) {
    return prisma.ioTNode.findMany({
      where: { deviceId },
      orderBy: { lastSeen: 'desc' },
    });
  }
}
