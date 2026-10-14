/**
 * Names for the tag and group ids that the member search and the quick filters refer to
 * (PHASE5_SPECS.md G5). A saved search can name a tag or group deleted since: it then matches
 * nothing for that condition, and the UI shows it as "(deleted)".
 */

export type ReferenceKind = 'tag' | 'group';

export interface SearchNames {
  /** Every tag (archived ones too) by id, or null until the list has loaded. */
  tags: ReadonlyMap<string, string> | null;
  /** Every group (archived ones too) by id, or null until the list has loaded. */
  groups: ReadonlyMap<string, string> | null;
}

export const NO_NAMES: SearchNames = { tags: null, groups: null };

/** The choices the tag and group inputs offer, as [id, label] pairs. */
export interface SearchChoices {
  tag: [string, string][];
  group: [string, string][];
}

export const NO_CHOICES: SearchChoices = { tag: [], group: [] };

export const DELETED_LABEL = '(deleted)';
const LOADING_LABEL = '…';

export interface ReferenceName {
  label: string;
  /** The list has loaded and has no such id. */
  deleted: boolean;
}

/** A tag's or group's name, "(deleted)" when it no longer exists, or "…" while loading. */
export function referenceName(names: SearchNames, kind: ReferenceKind, id: string): ReferenceName {
  const map = kind === 'tag' ? names.tags : names.groups;
  if (!map) return { label: LOADING_LABEL, deleted: false };
  const name = map.get(id);
  return name === undefined
    ? { label: DELETED_LABEL, deleted: true }
    : { label: name, deleted: false };
}
