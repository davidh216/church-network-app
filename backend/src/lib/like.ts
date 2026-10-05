// Prisma sends `contains`, `startsWith` and case-insensitive `equals` to PostgreSQL as LIKE/ILIKE
// patterns without escaping the value, so a `%` or `_` typed by a user would act as a wildcard.
// Escape them (and the escape character itself) so user input always matches literally.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
