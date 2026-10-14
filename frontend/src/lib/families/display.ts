import { enumLabel, type FamilyDetail, type RelationshipType } from '@embrace/shared';

/**
 * How a family is named in a sentence or heading: "Smith" -> "Smith family", but a name that
 * already ends with "family" (any case) is left alone, so never "Smith Family family".
 */
export function familyTitle(familyName: string): string {
  return /\bfamily$/i.test(familyName.trim()) ? familyName : `${familyName} family`;
}

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
