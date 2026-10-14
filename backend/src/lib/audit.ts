import type { AuditAction, Prisma } from '@prisma/client';
import type { AuditTargetType } from '@embrace/shared';

// The audit log (PHASE5_SPECS.md G1). Every audited change calls audit() with the transaction
// client it writes with, so the event commits or rolls back together with the change.

/** Who acted: the signed-in user (anything with an id), or null for the system. */
export type AuditActor = { id: string } | null;

export interface AuditTarget {
  type: AuditTargetType;
  id?: string | null;
}

export interface AuditExtra {
  /** How many rows the action touched (for example assignments removed with a tag). */
  count?: number;
  /** Context for the reader: names, old and new values. Never secrets, bodies or passwords. */
  metadata?: Prisma.InputJsonObject;
}

export function audit(
  tx: Prisma.TransactionClient,
  actor: AuditActor,
  action: AuditAction,
  target: AuditTarget,
  extra: AuditExtra = {},
) {
  return tx.auditEvent.create({
    data: {
      actorId: actor?.id ?? null,
      action,
      targetType: target.type,
      targetId: target.id ?? null,
      count: extra.count ?? null,
      metadata: extra.metadata,
    },
    select: { id: true },
  });
}
