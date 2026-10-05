/** Formatting helpers for the member profile at `/members/[id]`. */
import type { Impact, InteractionType, MilestoneType, Priority } from '@embrace/shared';
import {
  formatCalendarDate,
  formatLocalDate,
  formatLocalDateTime,
  isUtcMidnight,
  parseDate,
} from '@/lib/format/date';

/** A long date in the viewer's locale ("January 5, 2024" in en-US), or null without a real date. */
export function profileDate(dateString?: string | null): string | null {
  return formatLocalDate(dateString, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** A long date in the viewer's locale, or "Not set" for a field the profile always lists. */
export function formatDate(dateString?: string | null): string {
  return profileDate(dateString) ?? 'Not set';
}

/**
 * A long calendar date (a service date, an all-day timeline item) as its UTC day, so it shows the
 * same day in every time zone, or "Not set".
 */
export function formatDay(dateString?: string | null): string {
  return (
    formatCalendarDate(dateString, { year: 'numeric', month: 'long', day: 'numeric' }) ?? 'Not set'
  );
}

/** A milestone's achievedDate: its UTC day when it is a calendar date (UTC midnight). */
export function formatMilestoneDate(dateString?: string | null): string {
  return isUtcMidnight(dateString) ? formatDay(dateString) : formatDate(dateString);
}

/** Date and time in the viewer's locale ("Jan 5, 2024, 09:30 AM" in en-US), or "Not set". */
export function formatDateTime(dateString?: string | null): string {
  return (
    formatLocalDateTime(dateString, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) ?? 'Not set'
  );
}

/** Whole years since the date of birth, or null without one. */
export function calculateAge(dateOfBirth?: string | null, now: Date = new Date()): number | null {
  if (!dateOfBirth) return null;
  const birthDate = new Date(dateOfBirth);
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/**
 * "2 years, 3 months", "1 year", "5 months" or "Less than a month" since the membership date,
 * or "Unknown" without a real date. Zero parts are left out ("1 year", never "1 year, 0 month").
 */
export function membershipDuration(membershipDate?: string | null, now: Date = new Date()): string {
  const since = parseDate(membershipDate);
  if (!since) return 'Unknown';
  const diffTime = Math.abs(now.getTime() - since.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  const parts = [
    years > 0 ? plural(years, 'year') : null,
    months > 0 ? plural(months, 'month') : null,
  ].filter((part): part is string => part !== null);
  return parts.length ? parts.join(', ') : 'Less than a month';
}

const INTERACTION_ICONS: Record<InteractionType, string> = {
  email_sent: '📧',
  email_opened: '📬',
  sms_sent: '📱',
  sms_replied: '💬',
  call_made: '📞',
  visit_logged: '🏠',
  note_added: '📝',
};

export const interactionIcon = (type: string): string =>
  INTERACTION_ICONS[type as InteractionType] ?? '📋';

const MILESTONE_ICONS: Partial<Record<MilestoneType, string>> = {
  baptism: '✝️',
  confirmation: '🙏',
  wedding: '💒',
  first_volunteer: '🤝',
  leadership_role: '👑',
  anniversary: '🎉',
};

export const milestoneIcon = (type: string): string =>
  MILESTONE_ICONS[type as MilestoneType] ?? '🏆';

const PRIORITY_CLASSES: Partial<Record<Priority, string>> = {
  urgent: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  normal: 'bg-blue-100 text-blue-800',
};

export const priorityClass = (priority: string): string =>
  PRIORITY_CLASSES[priority as Priority] ?? 'bg-gray-100 text-gray-800';

const IMPACT_CLASSES: Partial<Record<Impact, string>> = {
  high: 'bg-purple-100 text-purple-800',
  medium: 'bg-blue-100 text-blue-800',
};

export const impactClass = (impact: string): string =>
  IMPACT_CLASSES[impact as Impact] ?? 'bg-gray-100 text-gray-800';

/** Risk badge colours: high red, medium yellow, otherwise green. */
export function riskBadgeClass(risk: string): string {
  if (risk === 'high') return 'bg-red-100 text-red-800';
  if (risk === 'medium') return 'bg-yellow-100 text-yellow-800';
  return 'bg-green-100 text-green-800';
}
