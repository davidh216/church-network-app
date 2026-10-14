import { enumLabel, type FamilyDetail, type RelationshipType } from '@embrace/shared';

/** "grandparent" -> "Grandparent". */
export const relationshipLabel = (type: RelationshipType): string => enumLabel(type);

/** "Ann is the parent of Ben"; "Ann is related to Ben" for `other`. */
export function relationSentence(name: string, type: RelationshipType, other: string): string {
  if (type === 'other') return `${name} is related to ${other}`;
  return `${name} is the ${type} of ${other}`;
}

/** The address on one line ("1 Main St, Springfield, IL 62701, USA"), or null when empty. */
export function addressText(
  family: Pick<FamilyDetail, 'address' | 'city' | 'state' | 'zipCode' | 'country'>,
): string | null {
  const region = [family.state, family.zipCode].filter(Boolean).join(' ');
  const parts = [family.address, family.city, region, family.country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}
