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
  if (value === null || value === undefined || value === '') return 'none';
  if (typeof value === 'object') {
    // A reference such as `movedTo: { id, name }` is shown by its name, never its id.
    const name = (value as Record<string, unknown>).name;
    return typeof name === 'string' ? name : Object.keys(value).join(', ');
  }
  return String(value as string | number | boolean);
};

/** A raw id (`memberId`, `tagId`, `relationshipId`, `headOfFamilyId`): the names say who. */
const isIdKey = (key: string) => key === 'id' || /[a-z]Id$/.test(key);

/** "memberName" -> "member", "relatedUserName" -> "related user", "headOfFamilyId" -> "head of family". */
export function fieldLabel(key: string): string {
  if (key === 'isActive') return 'active';
  const words = key
    .replace(/Id$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(' ');
  if (words.length > 1 && words.at(-1) === 'name') words.pop();
  return words.join(' ');
}

/** One changed field as "field: old → new"; a reference by id only says that it changed. */
function describeChange(key: string, change: unknown): string {
  const { from, to } = (change ?? {}) as { from?: unknown; to?: unknown };
  if (isIdKey(key)) {
    const what = from == null ? 'set' : to == null ? 'cleared' : 'changed';
    return `${fieldLabel(key)}: ${what}`;
  }
  return `${fieldLabel(key)}: ${show(from)} → ${show(to)}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * A one-line summary of an event's details: "member → leader, member" for a change with `from`
 * and `to`, "field: old → new" for each entry of `changes`, else its fields as "key: value".
 * Raw ids are left out (the names recorded beside them say who), and so is the target's own
 * name, which is shown in its own column.
 */
export function describeDetails(event: Pick<AuditEvent, 'metadata' | 'count'>): string {
  const parts: string[] = [];
  const metadata = event.metadata ?? {};
  if ('from' in metadata || 'to' in metadata) {
    parts.push(`${show(metadata.from)} → ${show(metadata.to)}`);
  }
  for (const [key, value] of Object.entries(metadata)) {
    if (key === 'name' || key === 'from' || key === 'to' || isIdKey(key)) continue;
    if (key === 'changes' && isRecord(value)) {
      for (const [field, change] of Object.entries(value))
        parts.push(describeChange(field, change));
      continue;
    }
    parts.push(`${fieldLabel(key)}: ${show(value)}`);
  }
  if (event.count !== null && event.count !== undefined) parts.push(`count: ${event.count}`);
  return parts.join('; ');
}
