/** Labels and colours for members, shared by the member list, profile, search and analytics. */
import { enumLabel, type MembershipStage, type RiskLevel } from '@embrace/shared';

/** A person's display name and, where the projection carries them, first and last names. */
export interface NamedPerson {
  name: string;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Initials, upper-cased: the first letters of the first and last names when both are set, else
 * the first letter of each word of the display name ("Ada Lovelace" -> "AL").
 */
export function initials(person: NamedPerson | string): string {
  const { name, firstName, lastName } = typeof person === 'string' ? { name: person } : person;
  const first = firstName?.trim();
  const last = lastName?.trim();
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

/** "core_member" -> "Core Member" (stages, risk levels, roles and other snake_case values). */
export function stageLabel(value: string): string {
  return enumLabel(value);
}

/** Select options ([value, label] pairs) for a list of enum values from `@embrace/shared`. */
export function enumOptions(
  values: readonly string[],
  label: (value: string) => string = stageLabel,
): [string, string][] {
  return values.map((value) => [value, label(value)]);
}

/** "medium" -> "Medium Risk". */
export function riskLabel(level: string): string {
  return `${stageLabel(level)} Risk`;
}

const NEUTRAL = 'bg-gray-100 text-gray-800';

const STAGE_CLASSES: Record<MembershipStage, string> = {
  leader: 'bg-purple-100 text-purple-800',
  core_member: 'bg-blue-100 text-blue-800',
  active_member: 'bg-green-100 text-green-800',
  new_member: 'bg-yellow-100 text-yellow-800',
  visitor: NEUTRAL,
  at_risk: 'bg-orange-100 text-orange-800',
  inactive: 'bg-red-100 text-red-800',
};

/** Badge colours for a membership stage; an unknown stage is grey. */
export function stageClass(stage: string): string {
  return STAGE_CLASSES[stage as MembershipStage] ?? NEUTRAL;
}

const RISK_CLASSES: Record<RiskLevel, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800',
};

/** Badge colours for a risk level; an unknown level is grey. */
export function riskClass(level: string): string {
  return RISK_CLASSES[level as RiskLevel] ?? NEUTRAL;
}

/** Dot colour for a risk level: low green, medium yellow, anything else red. */
export function riskDotClass(risk: string): string {
  if (risk === 'low') return 'bg-green-400';
  if (risk === 'medium') return 'bg-yellow-400';
  return 'bg-red-400';
}

/** Badge colours for an engagement score: 80+ green, 50+ yellow, otherwise red. */
export function engagementClass(score: number): string {
  if (score >= 80) return 'bg-green-100 text-green-800';
  if (score >= 50) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}
