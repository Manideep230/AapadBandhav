import prisma from '../../config/db';

export class UserRepository {
  static async findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }

  static async findUserByMobile(mobile: string) {
    return prisma.user.findUnique({ where: { mobile } });
  }

  static async createUser(data: any) {
    return prisma.user.create({ data });
  }

  static async updateUser(id: string, data: any) {
    return prisma.user.update({ where: { id }, data });
  }

  static async findOTPVerification(mobile: string) {
    return prisma.oTPVerification.findFirst({
      where: { mobile, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async createOTPVerification(mobile: string, otpHash: string, expiresAt: Date) {
    return prisma.oTPVerification.create({
      data: {
        mobile,
        otpHash,
        expiresAt,
        attempts: 0,
        verified: false,
      },
    });
  }

  static async updateOTPAttempts(id: string, attempts: number) {
    return prisma.oTPVerification.update({
      where: { id },
      data: { attempts },
    });
  }

  static async markOTPVerified(id: string, verified: boolean = true) {
    return prisma.oTPVerification.update({
      where: { id },
      data: { verified },
    });
  }

  // Multi-role lookups
  static async findHospitalByMobile(mobile: string) {
    return prisma.hospital.findUnique({ where: { mobile } });
  }

  static async findAmbulanceByMobile(mobile: string) {
    return prisma.ambulanceDriver.findUnique({ where: { mobile } });
  }

  static async findPoliceStationByMobile(mobile: string) {
    return prisma.policeStation.findUnique({ where: { mobile } });
  }

  static async findPolicemanByMobile(mobile: string) {
    return prisma.policeman.findUnique({ where: { mobile } });
  }

  static async findMechanicByMobile(mobile: string) {
    return prisma.mechanic.findUnique({ where: { mobile } });
  }

  static async findInsuranceByMobile(mobile: string) {
    return prisma.insuranceCompany.findUnique({ where: { mobile } });
  }

  // Emergency Contacts CRUD
  static async findEmergencyContacts(userId: string) {
    return prisma.emergencyContact.findMany({
      where: { userId },
      orderBy: { priority: 'asc' },
    });
  }

  static async createEmergencyContact(userId: string, data: any) {
    return prisma.emergencyContact.create({
      data: {
        userId,
        ...data,
      },
    });
  }

  static async updateEmergencyContact(id: string, data: any) {
    return prisma.emergencyContact.update({
      where: { id },
      data,
    });
  }

  static async deleteEmergencyContact(id: string) {
    return prisma.emergencyContact.delete({
      where: { id },
    });
  }
}
