import prisma from './backend/config/db';

async function main() {
  console.log("Connecting to prisma...");
  try {
    // Try ping command
    const res = await prisma.$runCommandRaw({ ping: 1 });
    console.log("Ping success:", res);
  } catch (e) {
    console.error("Ping failed:", e);
  }

  try {
    // Try a simple query
    const userCount = await prisma.user.count();
    console.log("User count:", userCount);
  } catch (e) {
    console.error("User count failed:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
