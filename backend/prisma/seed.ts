import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

try {
  process.loadEnvFile();
} catch {
  // no .env file
}

const prisma = new PrismaClient();

// Single source of truth for roles. Permissions are a JSON array of strings.
const ROLES = [
  { name: 'admin', description: 'Administrator with full access', permissions: ['*'] },
  {
    name: 'leader',
    description: 'Church leader: manage members and content',
    permissions: ['members:read', 'members:write', 'media:write', 'analytics:read'],
  },
  {
    name: 'member',
    description: 'Regular church member',
    permissions: ['directory:read', 'media:read'],
  },
] as const;

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description, permissions: JSON.stringify(role.permissions) },
      create: {
        name: role.name,
        description: role.description,
        permissions: JSON.stringify(role.permissions),
      },
    });
  }
  console.log(`Seeded ${ROLES.length} roles`);

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD?.trim();
  const name = process.env.SEED_ADMIN_NAME?.trim() || 'Administrator';
  if (email && password) {
    if (password.length < 12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
    const admin = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`Admin ${email} already exists; password left unchanged`);
    } else {
      await prisma.user.create({
        data: {
          email,
          name,
          password: await bcrypt.hash(password, 10),
          isActive: true,
          roles: { create: [{ roleId: admin.id }] },
        },
      });
      console.log(`Created admin ${email}`);
    }
  } else {
    console.log('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set; no admin user created');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
