import { z } from 'zod';
import {
  channel,
  impact,
  interactionCategory,
  interactionType,
  milestoneCategory,
  noteType,
  priority,
} from './enums.js';
import { boundedText, DATE_MESSAGE, requiredText } from './primitives.js';

// POST /api/member-details/:id/interactions (staff)
export const addInteractionInput = z.object({
  interactionType,
  channel,
  subject: boundedText('Subject', 200).optional(),
  content: boundedText('Content', 10_000).optional(),
  category: interactionCategory.optional(),
  priority: priority.default('normal'),
  responseRequired: z.boolean().default(false),
});

// POST /api/member-details/:id/milestones (staff)
export const addMilestoneInput = z.object({
  milestoneType: requiredText('Milestone type', 100),
  title: requiredText('Title', 200, 'Please enter a title'),
  description: boundedText('Description', 2000).optional(),
  achievedDate: z.coerce.date({ error: DATE_MESSAGE }),
  category: milestoneCategory.default('general'),
  impact: impact.default('medium'),
});

// POST /api/member-details/:id/notes (staff)
export const addNoteInput = z.object({
  title: boundedText('Title', 200).optional(),
  content: requiredText('Note', 10_000, 'Please enter the note'),
  noteType: noteType.default('general'),
  isPrivate: z.boolean().default(false),
  isFollowUp: z.boolean().default(false),
  followUpDate: z.coerce.date({ error: DATE_MESSAGE }).optional(),
});

export type AddInteractionInput = z.input<typeof addInteractionInput>;
export type AddMilestoneInput = z.input<typeof addMilestoneInput>;
export type AddNoteInput = z.input<typeof addNoteInput>;
