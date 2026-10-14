import { z } from 'zod';
import { tagCategory, type TagCategory } from './enums.js';
import { cuid, requiredText } from './primitives.js';

// Member tags (PHASE5_SPECS.md G2). Staff only: members never see tags (P5-D12).

export const MAX_TAG_NAME = 40;
export const DEFAULT_TAG_COLOR = '#3B82F6';
export const TAG_COLOR_MESSAGE = 'Enter a colour as #RRGGBB';
export const TAG_NAME_TAKEN = 'A tag with this name already exists';
export const TAG_ARCHIVED = 'This tag is archived and cannot be assigned';

const tagName = requiredText('Name', MAX_TAG_NAME);
const tagColor = z
  .string({ error: TAG_COLOR_MESSAGE })
  .regex(/^#[0-9A-Fa-f]{6}$/, { error: TAG_COLOR_MESSAGE });

// POST /api/tags (staff). Names are unique ignoring case (checked by the API).
export const createTagInput = z.object({
  name: tagName,
  color: tagColor.default(DEFAULT_TAG_COLOR),
  category: tagCategory.default('general'),
});

// PATCH /api/tags/:id (staff): any subset; `isActive: false` archives, `true` restores.
export const updateTagInput = z.object({
  name: tagName.optional(),
  color: tagColor.optional(),
  category: tagCategory.optional(),
  isActive: z.boolean({ error: 'Archived must be true or false' }).optional(),
});

// Query string of GET /api/tags (staff): archived tags only on request.
export const listTagsQuery = z.object({
  includeArchived: z
    .enum(['true', 'false'], { error: 'includeArchived must be true or false' })
    .optional()
    .transform((v) => v === 'true'),
});

// POST /api/users/:id/tags (staff): idempotent.
export const assignTagInput = z.object({ tagId: cuid });

export type CreateTagInput = z.input<typeof createTagInput>;
export type UpdateTagInput = z.input<typeof updateTagInput>;
export type ListTagsQuery = z.input<typeof listTagsQuery>;
export type AssignTagInput = z.input<typeof assignTagInput>;

/** A tag as GET /api/tags returns it. */
export interface Tag {
  id: string;
  name: string;
  color: string;
  category: TagCategory;
  /** False once archived: kept on members, but not assignable. */
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Members carrying the tag. */
  usageCount: number;
}

/** A tag as the staff member list and search show it on each row. */
export interface TagChip {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
}
