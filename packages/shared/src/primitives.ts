import { z } from 'zod';

// Building blocks used by the input schemas.

// Every primary key in the schema is a Prisma cuid().
export const cuid = z.string().cuid();

// Optional free-text fields: trimmed, and a blank value is stored as null.
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

// Optional free-text query-string parameters (search terms, filters): trimmed, and a blank or
// whitespace-only value counts as absent, so `?q=` behaves like no `q` at all.
export const optionalQueryText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? undefined : v))
    .optional();

// Arbitrary JSON metadata attached to activities and interactions (stored as a JSON string).
export const metadata = z.record(z.string(), z.unknown()).optional();

// Paging limits shared by the paged list endpoints.
export const MAX_PAGE_SIZE = 100;
export const MAX_PAGE = 100_000;

// A list query's input type as the web app builds it: `page` and `pageSize` are numbers (the
// schema coerces query-string values, so its own input type for them is `unknown`) and every
// other field keeps its schema input type.
export type WithNumericPaging<T> = {
  [K in keyof T]: K extends 'page' | 'pageSize' ? number | undefined : T[K];
};
