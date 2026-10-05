/**
 * Notices a redirect can ask the dashboard to show, as `/?notice=<code>`. Only these codes
 * render, so the query string cannot inject arbitrary text.
 */
export const NOTICES = {
  'staff-only': 'That page is only available to staff.',
} as const;

export type NoticeCode = keyof typeof NOTICES;

export function noticeHref(code: NoticeCode): string {
  return `/?notice=${code}`;
}

export function noticeMessage(code: string | null | undefined): string | null {
  if (!code || !Object.hasOwn(NOTICES, code)) return null;
  return NOTICES[code as NoticeCode];
}
