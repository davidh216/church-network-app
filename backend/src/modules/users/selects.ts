import type { Prisma } from '@prisma/client';

// User projections: the single source of truth for what each audience sees of a user.
// This file imports nothing from the app, so middleware/auth.ts can load selfSelect
// without an import cycle through the users router.

// What every authenticated member may see about other members.
export const directorySelect = {
  id: true,
  name: true,
  avatar: true,
  isActive: true,
  createdAt: true,
  roles: { include: { role: true } },
} satisfies Prisma.UserSelect;

// The signed-in user's own row (authenticate, /api/auth/me, login response).
// Never add `password` or the staff-only `notes` column here.
export const selfSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  avatar: true,
  bio: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  membershipDate: true,
  lastLoginAt: true,
  roles: { include: { role: true } },
} satisfies Prisma.UserSelect;

// What admins and leaders see (and what the member list is built around).
export const staffSelect = {
  ...selfSelect,
  engagement: {
    select: {
      engagementScore: true,
      membershipStage: true,
      riskLevel: true,
      lastActivity: true,
      attendanceScore: true,
      givingScore: true,
      volunteerScore: true,
      communityScore: true,
      communicationScore: true,
    },
  },
} satisfies Prisma.UserSelect;
