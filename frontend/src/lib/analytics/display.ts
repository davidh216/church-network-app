/** Colours for the analytics dashboard (stage and risk labels live in lib/members/display). */

/** Score badge: 80+ green, 60+ blue, 40+ yellow, otherwise red. */
export function engagementScoreClass(score: number): string {
  if (score >= 80) return 'text-green-800 bg-green-100';
  if (score >= 60) return 'text-blue-800 bg-blue-100';
  if (score >= 40) return 'text-yellow-800 bg-yellow-100';
  return 'text-red-800 bg-red-100';
}
