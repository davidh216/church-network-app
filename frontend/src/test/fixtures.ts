import type { User } from '@/types/domain';

export function makeUser(roleNames: string[], overrides: Partial<User> = {}): User {
  return {
    id: 'cluser0000000000000000001',
    email: 'ann@example.com',
    name: 'Ann Example',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    roles: roleNames.map((name) => ({ role: { id: `role-${name}`, name } })),
    ...overrides,
  };
}
