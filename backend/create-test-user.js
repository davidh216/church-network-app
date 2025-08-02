const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    console.log('Creating test user...');
    
    // Hash password
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: 'admin@embrace.church' }
    });
    
    if (existingUser) {
      console.log('Admin user already exists');
      // Update password
      await prisma.user.update({
        where: { email: 'admin@embrace.church' },
        data: { password: hashedPassword }
      });
      console.log('Password updated to: password123');
    } else {
      // Create new admin user
      const user = await prisma.user.create({
        data: {
          email: 'admin@embrace.church',
          password: hashedPassword,
          name: 'Admin User',
          phone: '555-0123',
          isActive: true
        }
      });
      console.log('Admin user created:', user.email);
      
      // Assign admin role
      const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
      if (adminRole) {
        await prisma.userRole.create({
          data: {
            userId: user.id,
            roleId: adminRole.id
          }
        });
        console.log('Admin role assigned');
      }
    }
    
    console.log('✅ Test admin user ready: admin@embrace.church / password123');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();