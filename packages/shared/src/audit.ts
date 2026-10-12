import { z } from 'zod';
import { auditAction, type AuditAction } from './enums.js';
import {
  cuid,
  DATE_MESSAGE,
  MAX_PAGE,
  MAX_PAGE_SIZE,
  type WithNumericPaging,
} from './primitives.js';

// The audit log (PHASE5_SPECS.md G1): GET /api/audit (admin).

// The kinds of object an audit event can name. The column is free text, so later phases add
// kinds here without a migration.
export const AUDIT_TARGET_TYPES = ['user', 'tag', 'group', 'family'] as const;
export const auditTargetType = z.enum(AUDIT_TARGET_TYPES);
export type AuditTargetType = z.infer<typeof auditTargetType>;

export const DEFAULT_AUDIT_PAGE_SIZE = 50;
const DATE_RANGE_MESSAGE = 'The start date must not be after the end date';
const calendarDate = z.iso.date({ error: DATE_MESSAGE });

// Query string of GET /api/audit. `from` and `to` are inclusive calendar days (UTC). A target id
// needs its type.
export const listAuditQuery = z
  .object({
    actorId: cuid.optional(),
    action: auditAction.optional(),
    targetType: auditTargetType.optional(),
    targetId: cuid.optional(),
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_AUDIT_PAGE_SIZE),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { error: DATE_RANGE_MESSAGE, path: ['to'] })
  .refine((q) => !q.targetId || q.targetType, {
    error: 'Choose the target type too',
    path: ['targetType'],
  });

export type ListAuditQuery = z.input<typeof listAuditQuery>;
export type ListAuditParams = WithNumericPaging<ListAuditQuery>;

/** One row of GET /api/audit, newest first. */
export interface AuditEvent {
  id: string;
  action: AuditAction;
  /** Null once the actor's account has been deleted. */
  actor: { id: string; name: string } | null;
  targetType: string;
  targetId: string | null;
  /**
   * The target's display name: the user's current name, else the name recorded with the event
   * (tags, groups and families keep theirs in `metadata.name`), else null.
   */
  targetName: string | null;
  count: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
