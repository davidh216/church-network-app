/** Formatting helpers for the member profile at `/members/[id]`. */

/** "January 5, 2024", or "Not set". */
export function formatDate(dateString?: string | null): string {
  if (!dateString) return 'Not set';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** "Jan 5, 2024, 09:30 AM", or "Not set". */
export function formatDateTime(dateString?: string | null): string {
  if (!dateString) return 'Not set';
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** A JSON-encoded string array (skills, interests); anything unparsable or non-array is []. */
export function parseJsonList(value?: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
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

const plural = (n: number, unit: string) => `${n} ${unit}${n > 1 ? 's' : ''}`;

/** "2 years, 3 months" or "5 months" since the membership date, or "Unknown". */
export function membershipDuration(membershipDate?: string | null, now: Date = new Date()): string {
  if (!membershipDate) return 'Unknown';
  const diffTime = Math.abs(now.getTime() - new Date(membershipDate).getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  return years > 0
    ? `${plural(years, 'year')}, ${plural(months, 'month')}`
    : plural(months, 'month');
}

const INTERACTION_ICONS: Record<string, string> = {
  email_sent: '📧',
  email_opened: '📬',
  sms_sent: '📱',
  sms_replied: '💬',
  call_made: '📞',
  visit_logged: '🏠',
  note_added: '📝',
};

export const interactionIcon = (type: string): string => INTERACTION_ICONS[type] ?? '📋';

const MILESTONE_ICONS: Record<string, string> = {
  baptism: '✝️',
  confirmation: '🙏',
  wedding: '💒',
  first_volunteer: '🤝',
  leadership_role: '👑',
  anniversary: '🎉',
};

export const milestoneIcon = (type: string): string => MILESTONE_ICONS[type] ?? '🏆';

const PRIORITY_CLASSES: Record<string, string> = {
  urgent: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  normal: 'bg-blue-100 text-blue-800',
};

export const priorityClass = (priority: string): string =>
  PRIORITY_CLASSES[priority] ?? 'bg-gray-100 text-gray-800';

const IMPACT_CLASSES: Record<string, string> = {
  high: 'bg-purple-100 text-purple-800',
  medium: 'bg-blue-100 text-blue-800',
};

export const impactClass = (impact: string): string =>
  IMPACT_CLASSES[impact] ?? 'bg-gray-100 text-gray-800';

/** Risk badge colours: high red, medium yellow, otherwise green. */
export function riskBadgeClass(risk: string): string {
  if (risk === 'high') return 'bg-red-100 text-red-800';
  if (risk === 'medium') return 'bg-yellow-100 text-yellow-800';
  return 'bg-green-100 text-green-800';
}
