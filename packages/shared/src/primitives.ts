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

// Arbitrary JSON metadata attached to activities and interactions (stored as a JSON string).
export const metadata = z.record(z.string(), z.unknown()).optional();

// Page sizes shared by the paged list endpoints.
export const MAX_PAGE_SIZE = 100;
