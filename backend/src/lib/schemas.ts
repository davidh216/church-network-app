import { z } from 'zod';

// Building blocks shared by the module schemas.

// Every primary key in the schema is a Prisma cuid().
export const cuid = z.string().cuid();
export const idParams = z.object({ id: cuid });

// Pagination for list endpoints: coerced from the query string, at most 100 rows per page.
export const pagination = (defaultLimit: number) => ({
  limit: z.coerce.number().int().min(1).max(100).default(defaultLimit),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

// Optional free-text fields: trimmed, and a blank value is stored as null.
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

// Stringly-typed CRM columns (see prisma/schema.prisma). Phase 3 turns them into database enums.
export const membershipStage = z.enum([
  'visitor',
  'new_member',
  'active_member',
  'core_member',
  'leader',
  'at_risk',
  'inactive',
]);
export const riskLevel = z.enum(['low', 'medium', 'high']);
export const interactionType = z.enum([
  'email_sent',
  'email_opened',
  'sms_sent',
  'sms_replied',
  'call_made',
  'visit_logged',
  'note_added',
]);
export const channel = z.enum(['email', 'sms', 'phone', 'in_person', 'social_media']);
export const priority = z.enum(['low', 'normal', 'high', 'urgent']);
export const interactionCategory = z.enum([
  'welcome',
  'follow_up',
  'pastoral_care',
  'event_invitation',
  'giving_reminder',
  'volunteer_request',
]);
export const milestoneCategory = z.enum([
  'general',
  'spiritual',
  'service',
  'family',
  'personal',
  'ministry',
]);
export const impact = z.enum(['low', 'medium', 'high']);
export const noteType = z.enum([
  'general',
  'pastoral_care',
  'follow_up',
  'prayer_request',
  'concern',
]);

// Arbitrary JSON metadata attached to activities and interactions (stored as a JSON string).
export const metadata = z.record(z.string(), z.unknown()).optional();
