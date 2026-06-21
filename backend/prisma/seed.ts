import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  AapadBandhav — Idempotent Seed Script
 *  SAFE FOR PRODUCTION: uses upsert only — never deletes existing data.
 *  Run with:  npx prisma db seed
 * ─────────────────────────────────────────────────────────────────────────────
 */

const VIJAYAWADA_BASE = { lat: 16.5063, lng: 80.6480 };

function randomOffset(base: number, rangeVal: number = 0.05): number {
  return parseFloat((base + (Math.random() - 0.5) * rangeVal).toFixed(6));
}

function generateDeviceId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('');
}

function generateUniqueId(): string {
  let digits = '';
  for (let i = 0; i < 8; i++) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  return 'AB' + digits;
}

async function main() {
  console.log('🌱 Starting idempotent database seed (production-safe — no data deleted)...');

  // ── 1. Seed Devices (only if fewer than 5 unlinked devices exist) ──────────
  const existingDeviceCount = await prisma.device.count({ where: { isLinked: false } });
  if (existingDeviceCount < 5) {
    const needed = 5 - existingDeviceCount;
    console.log(`  Creating ${needed} new unlinked device(s) (${existingDeviceCount} already exist)...`);
    for (let i = 0; i < needed; i++) {
      const devId = generateDeviceId();
      const passName = 'DEV' + Math.floor(100000 + Math.random() * 900000).toString(36).toUpperCase();
      const passCode = 'PASS' + Math.floor(1000 + Math.random() * 9000).toString();
      const simCode = '88' + Math.floor(10000000000 + Math.random() * 90000000000).toString();

      const device = await prisma.device.create({
        data: {
          deviceId: devId,
          passName,
          passCode,
          simCode,
          qrCode: JSON.stringify({ deviceCode: devId, passName, passCode, simCode }),
          status: 'inactive',
          isActive: true,
          isLinked: false,
          batteryLevel: 100,
          firmwareVersion: '1.0.0',
        },
      });
      console.log(`  Device: ${device.deviceId}`);
    }
  } else {
    console.log(`  Devices: ${existingDeviceCount} unlinked device(s) already present — skipping.`);
  }

  // ── 2. Seed Hospitals ──────────────────────────────────────────────────────
  const hospitals = [
    { name: 'Manipal Hospital Vijayawada', email: 'manipal@hospital.com', mobile: '9300001111', lat: 16.5060, lng: 80.6450, capacity: 300, avail: 65, specs: ['Emergency', 'Trauma', 'ICU', 'Cardiology'] },
    { name: 'Andhra Hospitals', email: 'andhra@hospital.com', mobile: '9300002222', lat: 16.5090, lng: 80.6510, capacity: 200, avail: 40, specs: ['Emergency', 'Neurology', 'Orthopedics'] },
    { name: 'Ramesh Hospitals', email: 'ramesh@hospital.com', mobile: '9300003333', lat: 16.5030, lng: 80.6420, capacity: 150, avail: 25, specs: ['Emergency', 'General Medicine'] },
  ];

  for (const h of hospitals) {
    const existing = await prisma.hospital.findFirst({ where: { email: h.email } });
    if (!existing) {
      const hosp = await prisma.hospital.create({
        data: {
          name: h.name, email: h.email, mobile: h.mobile,
          latitude: h.lat, longitude: h.lng,
          city: 'Vijayawada', state: 'Andhra Pradesh',
          bedCapacity: h.capacity, availableBeds: h.avail,
          specializations: h.specs,
          registrationNumber: `AP-HOSP-${Math.floor(1000 + Math.random() * 9000)}`,
          isActive: true, isAvailable: true, mobileVerified: true,
        },
      });
      console.log(`  Hospital created: ${hosp.name}`);
    } else {
      console.log(`  Hospital exists: ${h.name} — skipped.`);
    }
  }

  // ── 3. Seed Ambulance Drivers ──────────────────────────────────────────────
  const ambulances = [
    { name: 'Ravi Ambulance Service', email: 'ravi@ambulance.com', mobile: '9400001111', vehicle: 'AP16AMB001' },
    { name: 'Sita Emergency Services', email: 'sita@ambulance.com', mobile: '9400002222', vehicle: 'AP16AMB002' },
    { name: 'Mohan Emergency Driver', email: 'mohan@ambulance.com', mobile: '9400003333', vehicle: 'AP16AMB003' },
  ];

  for (const a of ambulances) {
    const existing = await prisma.ambulanceDriver.findFirst({ where: { email: a.email } });
    if (!existing) {
      const amb = await prisma.ambulanceDriver.create({
        data: {
          name: a.name, email: a.email, mobile: a.mobile,
          vehicleNumber: a.vehicle,
          latitude: randomOffset(VIJAYAWADA_BASE.lat),
          longitude: randomOffset(VIJAYAWADA_BASE.lng),
          licenseNumber: `AP-DL-${Math.floor(1000000 + Math.random() * 9000000)}`,
          isActive: true, isAvailable: true, mobileVerified: true,
          lastSeen: new Date(),
        },
      });
      console.log(`  Ambulance created: ${amb.name}`);
    } else {
      console.log(`  Ambulance exists: ${a.name} — skipped.`);
    }
  }

  // ── 4. Seed Police Stations ────────────────────────────────────────────────
  const stations = [
    { name: 'One Town Police Station', email: 'onetown@police.com', mobile: '9500001111', lat: 16.5074, lng: 80.6480, code: 'AP-PS-VJA-OT' },
    { name: 'Governorpet Police Station', email: 'governorpet@police.com', mobile: '9500002222', lat: 16.5048, lng: 80.6365, code: 'AP-PS-VJA-GP' },
    { name: 'Labbipet Police Station', email: 'labbipet@police.com', mobile: '9500003333', lat: 16.5110, lng: 80.6320, code: 'AP-PS-VJA-LP' },
  ];

  const dbStations: any[] = [];
  for (const s of stations) {
    let station = await prisma.policeStation.findFirst({ where: { email: s.email } });
    if (!station) {
      station = await prisma.policeStation.create({
        data: {
          name: s.name, email: s.email, mobile: s.mobile,
          latitude: s.lat, longitude: s.lng,
          city: 'Vijayawada', state: 'Andhra Pradesh',
          stationCode: s.code,
          address: `${s.name}, Vijayawada, Andhra Pradesh`,
          isActive: true, isAvailable: true, mobileVerified: true,
        },
      });
      console.log(`  Police Station created: ${station.name}`);
    } else {
      console.log(`  Police Station exists: ${s.name} — skipped.`);
    }
    dbStations.push(station);
  }

  // ── 5. Seed Policemen ──────────────────────────────────────────────────────
  const policemen = [
    { name: 'Constable Raju Reddy', email: 'raju@cop.com', mobile: '9600001111', badge: 'AP-12345' },
    { name: 'SI Venkata Rao', email: 'venkata@cop.com', mobile: '9600002222', badge: 'AP-12346' },
    { name: 'Constable Lakshmi Devi', email: 'lakshmi@cop.com', mobile: '9600003333', badge: 'AP-12347' },
  ];

  for (let i = 0; i < policemen.length; i++) {
    const p = policemen[i];
    const existing = await prisma.policeman.findFirst({ where: { email: p.email } });
    if (!existing) {
      const cop = await prisma.policeman.create({
        data: {
          name: p.name, email: p.email, mobile: p.mobile,
          badgeNumber: p.badge,
          latitude: randomOffset(VIJAYAWADA_BASE.lat),
          longitude: randomOffset(VIJAYAWADA_BASE.lng),
          stationId: dbStations[i % dbStations.length].id,
          isActive: true, isAvailable: true, mobileVerified: true,
          lastSeen: new Date(),
        },
      });
      console.log(`  Policeman created: ${cop.name}`);
    } else {
      console.log(`  Policeman exists: ${p.name} — skipped.`);
    }
  }

  // ── 6. Seed Mechanics ─────────────────────────────────────────────────────
  const mechanics = [
    { name: 'Rajesh Mechanics', email: 'rajesh@mechanic.com', mobile: '9700001111', spec: 'Car, Motorcycle' },
    { name: 'Quick Fix Auto Works', email: 'quickfix@mechanic.com', mobile: '9700002222', spec: 'All vehicles' },
    { name: 'Vijay Auto Garage', email: 'vijay@mechanic.com', mobile: '9700003333', spec: 'Heavy vehicles, Trucks' },
  ];

  for (const m of mechanics) {
    const existing = await prisma.mechanic.findFirst({ where: { email: m.email } });
    if (!existing) {
      const mech = await prisma.mechanic.create({
        data: {
          name: m.name, email: m.email, mobile: m.mobile,
          specialization: m.spec,
          latitude: randomOffset(VIJAYAWADA_BASE.lat),
          longitude: randomOffset(VIJAYAWADA_BASE.lng),
          isActive: true, isAvailable: true, mobileVerified: true,
          lastSeen: new Date(),
        },
      });
      console.log(`  Mechanic created: ${mech.name}`);
    } else {
      console.log(`  Mechanic exists: ${m.name} — skipped.`);
    }
  }

  // ── 7. Seed Insurance Companies ───────────────────────────────────────────
  const insurance = [
    { name: 'Safe Drive Insurance', email: 'safedrive@insurance.com', mobile: '9800001111', license: 'IRDAI-AP-123456' },
    { name: 'NighaTech Insure Co.', email: 'nighatech@insurance.com', mobile: '9800002222', license: 'IRDAI-AP-123457' },
    { name: 'AP Road Shield', email: 'roadshield@insurance.com', mobile: '9800003333', license: 'IRDAI-AP-123458' },
  ];

  for (const ins of insurance) {
    const existing = await prisma.insuranceCompany.findFirst({ where: { email: ins.email } });
    if (!existing) {
      const company = await prisma.insuranceCompany.create({
        data: {
          name: ins.name, email: ins.email, mobile: ins.mobile,
          licenseNumber: ins.license,
          latitude: randomOffset(VIJAYAWADA_BASE.lat),
          longitude: randomOffset(VIJAYAWADA_BASE.lng),
          city: 'Vijayawada',
          address: 'MG Road, Vijayawada, Andhra Pradesh',
          isActive: true, mobileVerified: true,
        },
      });
      console.log(`  Insurance created: ${company.name}`);
    } else {
      console.log(`  Insurance exists: ${ins.name} — skipped.`);
    }
  }

  // ── 8. Seed Volunteers (Rangers) ──────────────────────────────────────────
  const volunteers = [
    { name: 'Ramesh Volunteer', email: 'ramesh@volunteer.com', mobile: '9900001111', lat: 16.5061, lng: 80.6482 },
    { name: 'Priya Ranger', email: 'priya@volunteer.com', mobile: '9900002222', lat: 16.5080, lng: 80.6470 },
    { name: 'Suresh First Responder', email: 'suresh@volunteer.com', mobile: '9900003333', lat: 16.5040, lng: 80.6490 },
  ];

  for (const v of volunteers) {
    const existing = await prisma.user.findFirst({ where: { email: v.email } });
    if (!existing) {
      const vol = await prisma.user.create({
        data: {
          fullName: v.name, email: v.email, mobile: v.mobile,
          role: 'volunteer',
          uniqueId: generateUniqueId(),
          lastLocationLat: v.lat, lastLocationLng: v.lng,
          isActive: true, isAvailable: true, mobileVerified: true,
          lastSeen: new Date(),
        },
      });
      console.log(`  Volunteer created: ${vol.fullName}`);
    } else {
      console.log(`  Volunteer exists: ${v.name} — skipped.`);
    }
  }

  // ── 9. Seed Fire Department ────────────────────────────────────────────────
  const fire = [
    { name: 'Vijayawada Central Fire Station', email: 'central@fire.com', mobile: '9100001111', lat: 16.5065, lng: 80.6478 },
    { name: 'Benz Circle Fire Unit', email: 'benzcircle@fire.com', mobile: '9100002222', lat: 16.5100, lng: 80.6500 },
    { name: 'Governorpet Fire Rescue', email: 'governorpet@fire.com', mobile: '9100003333', lat: 16.5045, lng: 80.6360 },
  ];

  for (const f of fire) {
    const existing = await prisma.user.findFirst({ where: { email: f.email } });
    if (!existing) {
      const fd = await prisma.user.create({
        data: {
          fullName: f.name, email: f.email, mobile: f.mobile,
          role: 'fire_department',
          uniqueId: generateUniqueId(),
          lastLocationLat: f.lat, lastLocationLng: f.lng,
          isActive: true, isAvailable: true, mobileVerified: true,
          lastSeen: new Date(),
        },
      });
      console.log(`  Fire Dept created: ${fd.fullName}`);
    } else {
      console.log(`  Fire Dept exists: ${f.name} — skipped.`);
    }
  }

  console.log('✅ Seed completed — all existing production data preserved.');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
