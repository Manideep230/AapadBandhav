import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function generate8DigitId(): string {
  let digits = '';
  for (let i = 0; i < 8; i++) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  return 'AB' + digits;
}

async function runBackfill() {
  console.log('🔄 Starting AB ID backfill migration...');
  
  try {
    const users = await prisma.user.findMany();
    console.log(`Found ${users.length} total users in database.`);

    const usedIds = new Set<string>();
    
    // Add existing valid IDs to the used list
    for (const u of users) {
      if (u.uniqueId && /^AB\d{8}$/.test(u.uniqueId)) {
        usedIds.add(u.uniqueId);
      }
    }

    let backfilledCount = 0;

    for (const u of users) {
      const isValid = u.uniqueId && /^AB\d{8}$/.test(u.uniqueId);
      
      if (!isValid) {
        let newId = '';
        if (u.id === 'admin-001') {
          newId = 'AB00000001';
        } else {
          while (true) {
            newId = generate8DigitId();
            if (!usedIds.has(newId)) {
              // Double check in database just in case
              const dup = await prisma.user.findUnique({ where: { uniqueId: newId } });
              if (!dup) break;
            }
          }
        }

        usedIds.add(newId);

        await prisma.user.update({
          where: { id: u.id },
          data: { uniqueId: newId }
        });

        console.log(`✅ Backfilled user "${u.fullName}" (${u.role}): "${u.uniqueId}" -> "${newId}"`);
        backfilledCount++;
      } else {
        console.log(`ℹ️ User "${u.fullName}" already has a valid ID: "${u.uniqueId}"`);
      }
    }

    console.log(`🎉 Backfill migration complete! Backfilled ${backfilledCount} users.`);
  } catch (error) {
    console.error('❌ Error during backfill migration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runBackfill();
