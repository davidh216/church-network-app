import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
// Compiled with this file into dist/src/lib/pg-config.js (tsconfig.seed.json), so the seed stays
// runnable as dist/prisma/seed.js.
import { pgConfigFromUrl } from '../src/lib/pg-config';

try {
  process.loadEnvFile();
} catch {
  // no .env file
}

// Built like the API's client (pgAdapter in src/lib/prisma.ts): Prisma 7 connects through the pg
// driver adapter, configured from the URL as Prisma 6 read it.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const { config, schema } = pgConfigFromUrl(connectionString);
const prisma = new PrismaClient({ adapter: new PrismaPg(config, { schema }) });

// Single source of truth for roles. Permissions are a list of strings (a text[] column).
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
      update: { description: role.description, permissions: [...role.permissions] },
      create: {
        name: role.name,
        description: role.description,
        permissions: [...role.permissions],
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
          engagement: { create: {} },
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
