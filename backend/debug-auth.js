const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const JWT_SECRET = 'your-super-secret-jwt-key-change-this';

async function debugAuth() {
  try {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjbWR1YnUwZmYwMDAwdXoyOGVja3Y3eGdlIiwiaWF0IjoxNzU0MTQzNjQ2LCJleHAiOjE3NTQ3NDg0NDZ9.ggnVC5ukbbHOb5ieeSm9SYmM5JE5Gxal1TKrZ468pig';
    
    console.log('Debugging token...');
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Decoded token:', decoded);
    
    console.log('Looking for user:', decoded.userId);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        roles: {
          include: {
            role: true
          }
        }
      }
    });
    
    if (user) {
      console.log('User found:', {
        id: user.id,
        email: user.email,
        name: user.name,
        isActive: user.isActive,
        roles: user.roles.map(r => r.role.name)
      });
    } else {
      console.log('User NOT found');
      
      // Check if user exists at all
      const userExists = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });
      
      if (userExists) {
        console.log('User exists but query failed:', userExists);
      } else {
        console.log('User does not exist in database');
      }
    }
    
  } catch (error) {
    console.error('Debug error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugAuth();