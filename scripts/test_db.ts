import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'mongodb://localhost:27017/aapadbandhav?directConnection=true'
    }
  }
});

async function main() {
  console.log('Connecting to MongoDB...');
  await prisma.$connect();
  console.log('Connected! Counting users...');
  const count = await prisma.user.count();
  console.log('User count:', count);
}

main()
  .catch(err => {
    console.error('Failed to connect:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
