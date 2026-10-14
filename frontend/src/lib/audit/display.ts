import { enumLabel, type AuditEvent } from '@embrace/shared';

/** "user_role_changed" -> "User role changed". */
export function actionLabel(action: string): string {
  const label = enumLabel(action);
  return label.charAt(0) + label.slice(1).toLowerCase();
}

/** The page of an audited object: a member profile, a group or a family; null for the rest. */
export function targetHref(targetType: string, targetId: string | null): string | null {
  if (!targetId) return null;
  const id = encodeURIComponent(targetId);
  switch (targetType) {
    case 'user':
      return `/members/${id}`;
    case 'group':
      return `/groups/${id}`;
    case 'family':
      return `/families/${id}`;
    default:
      return null;
  }
}

/**
 * How the target is named in the log: its name, marked "(deleted)" once it no longer exists, or
 * "Deleted <type>" when its name was never recorded.
 */
export function targetText(
  event: Pick<AuditEvent, 'targetType' | 'targetId' | 'targetName' | 'targetExists'>,
): string {
  if (!event.targetName) return `Deleted ${event.targetType}`;
  if (event.targetId && !event.targetExists) return `${event.targetName} (deleted)`;
  return event.targetName;
}

/** The link to the target's page, only while the target still exists (a deleted one would 404). */
export function targetLink(
  event: Pick<AuditEvent, 'targetType' | 'targetId' | 'targetExists'>,
): string | null {
  return event.targetExists ? targetHref(event.targetType, event.targetId) : null;
}

const show = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(show).join(', ') || 'none';
  if (value === null || value === undefined) return 'none';
  if (typeof value === 'object') return Object.keys(value).join(', ');
  return String(value as string | number | boolean);
};

/**
 * A one-line summary of an event's details: "member → leader, member" for a change with `from`
 * and `to`, else its fields as "key: value" (the target's own name is shown elsewhere).
 */
export function describeDetails(event: Pick<AuditEvent, 'metadata' | 'count'>): string {
  const parts: string[] = [];
  const metadata = event.metadata ?? {};
  if ('from' in metadata || 'to' in metadata) {
    parts.push(`${show(metadata.from)} → ${show(metadata.to)}`);
  }
  for (const [key, value] of Object.entries(metadata)) {
    if (key === 'name' || key === 'from' || key === 'to') continue;
    parts.push(`${key}: ${show(value)}`);
  }
  if (event.count !== null && event.count !== undefined) parts.push(`count: ${event.count}`);
  return parts.join('; ');
}
