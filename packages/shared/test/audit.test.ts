import { describe, expect, it } from 'vitest';
import { listAuditQuery } from '../src';

describe('audit query schema', () => {
  it('pages 50 by default and checks the range and the target', () => {
    expect(listAuditQuery.parse({})).toEqual({ page: 1, pageSize: 50 });
    expect(listAuditQuery.safeParse({ from: '2026-02-01', to: '2026-01-01' }).success).toBe(false);
    expect(listAuditQuery.safeParse({ targetId: 'cka1b2c3d4e5f6g7h8i9j0k1l' }).success).toBe(false);
    expect(listAuditQuery.safeParse({ action: 'user.role_changed' }).success).toBe(false);
    expect(
      listAuditQuery.parse({ action: 'tag_assigned', targetType: 'user', page: '2' }),
    ).toMatchObject({ action: 'tag_assigned', targetType: 'user', page: 2 });
  });
});
