const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkEngagement() {
  try {
    console.log('Checking engagement data...');
    
    const engagementCount = await prisma.memberEngagement.count();
    console.log(`Total engagement records: ${engagementCount}`);
    
    const engagements = await prisma.memberEngagement.findMany({
      include: {
        user: {
          select: { name: true, email: true }
        }
      }
    });
    
    console.log('Engagement records:');
    engagements.forEach(e => {
      console.log(`- ${e.user.name} (${e.user.email}): Score ${e.engagementScore}, Stage: ${e.membershipStage}`);
    });
    
    // Try to query users with engagement data
    console.log('\nTesting enhanced user query...');
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        engagement: true
      }
    });
    
    console.log('Users with engagement query result:');
    users.forEach(user => {
      console.log(`- ${user.name}: ${user.engagement ? 'Has engagement' : 'No engagement'}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkEngagement();