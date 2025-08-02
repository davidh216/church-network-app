const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkUsers() {
  try {
    console.log('Checking database connection...');
    
    // Check total users
    const userCount = await prisma.user.count();
    console.log(`Total users in database: ${userCount}`);
    
    // Get all users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true
      }
    });
    
    console.log('Users found:');
    users.forEach(user => {
      console.log(`- ${user.name} (${user.email}) - Active: ${user.isActive} - Created: ${user.createdAt}`);
    });
    
    // Check roles
    const roleCount = await prisma.role.count();
    console.log(`\nTotal roles: ${roleCount}`);
    
    const roles = await prisma.role.findMany();
    console.log('Roles found:');
    roles.forEach(role => {
      console.log(`- ${role.name}: ${role.description}`);
    });
    
    // Check user roles
    const userRoles = await prisma.userRole.findMany({
      include: {
        user: { select: { name: true, email: true } },
        role: { select: { name: true } }
      }
    });
    
    console.log('\nUser role assignments:');
    userRoles.forEach(ur => {
      console.log(`- ${ur.user.name} (${ur.user.email}) has role: ${ur.role.name}`);
    });
    
  } catch (error) {
    console.error('Database error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();