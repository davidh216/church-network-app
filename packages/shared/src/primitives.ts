import { z } from 'zod';

// Building blocks used by the input schemas.

// Human messages for the rules every form shows inline; the API returns the same text in its
// 400 details, so the forms and the API agree by construction.
export const tooLong = (label: string, max: number) => `${label} must be at most ${max} characters`;
export const isRequired = (label: string) => `${label} is required`;
export const EMAIL_MESSAGE = 'Enter a valid email address';
export const ID_MESSAGE = 'Must be a valid id';
export const DATE_MESSAGE = 'Enter a valid date';

// Every primary key in the schema is a Prisma cuid().
export const cuid = z.string({ error: ID_MESSAGE }).cuid({ error: ID_MESSAGE });

// A required free-text field: trimmed, at least one character, at most `max`.
export const requiredText = (label: string, max: number, required = isRequired(label)) =>
  z.string({ error: required }).trim().min(1, required).max(max, tooLong(label, max));

// An optional free-text field kept as a string: trimmed, at most `max`.
export const boundedText = (label: string, max: number) =>
  z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, tooLong(label, max));

// An email address as the account forms take it.
export const emailAddress = z.email({ error: EMAIL_MESSAGE }).max(254, tooLong('Email', 254));

// Optional free-text fields: trimmed, and a blank value is stored as null.
export const optionalText = (label: string, max: number) =>
  boundedText(label, max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

// Optional free-text query-string parameters (search terms, filters): trimmed, and a blank or
// whitespace-only value counts as absent, so `?q=` behaves like no `q` at all.
export const optionalQueryText = (label: string, max: number) =>
  boundedText(label, max)
    .transform((v) => (v === '' ? undefined : v))
    .optional();

// A list of short labels stored as a text[] column (skills, interests): each entry trimmed and
// non-blank, duplicates removed (first spelling wins, ignoring case).
export const labelList = (label: string, maxItems: number, maxLength = 50) =>
  z
    .array(requiredText(`Each ${label.toLowerCase()}`, maxLength, `${label} cannot be blank`), {
      error: `${label} must be a list`,
    })
    .max(maxItems, `Add at most ${maxItems} ${label.toLowerCase()}`)
    .transform((items) =>
      items.filter(
        (item, i) => items.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === i,
      ),
    );

// Arbitrary JSON metadata attached to activities and interactions (stored as a JSON object).
export const metadata = z.record(z.string(), z.unknown()).optional();

// The longest free-text search term (member `q`, media `search`, search condition values).
export const MAX_QUERY_TEXT = 200;

// Paging limits shared by the paged list endpoints.
export const MAX_PAGE_SIZE = 100;
export const MAX_PAGE = 100_000;

// A list query's input type as the web app builds it: `page` and `pageSize` are numbers (the
// schema coerces query-string values, so its own input type for them is `unknown`) and every
// other field keeps its schema input type.
export type WithNumericPaging<T> = {
  [K in keyof T]: K extends 'page' | 'pageSize' ? number | undefined : T[K];
};
