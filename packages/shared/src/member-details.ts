import { z } from 'zod';
import {
  channel,
  impact,
  interactionCategory,
  interactionType,
  milestoneCategory,
  noteType,
  priority,
} from './enums';

// POST /api/member-details/:id/interactions (staff)
export const addInteractionInput = z.object({
  interactionType,
  channel,
  subject: z.string().trim().max(200).optional(),
  content: z.string().trim().max(10_000).optional(),
  category: interactionCategory.optional(),
  priority: priority.default('normal'),
  responseRequired: z.boolean().default(false),
});

// POST /api/member-details/:id/milestones (staff)
export const addMilestoneInput = z.object({
  milestoneType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  achievedDate: z.coerce.date(),
  category: milestoneCategory.default('general'),
  impact: impact.default('medium'),
});

// POST /api/member-details/:id/notes (staff)
export const addNoteInput = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.string().trim().min(1).max(10_000),
  noteType: noteType.default('general'),
  isPrivate: z.boolean().default(false),
  isFollowUp: z.boolean().default(false),
  followUpDate: z.coerce.date().optional(),
});

export type AddInteractionInput = z.input<typeof addInteractionInput>;
export type AddMilestoneInput = z.input<typeof addMilestoneInput>;
export type AddNoteInput = z.input<typeof addNoteInput>;
