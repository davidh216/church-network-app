import { z } from 'zod';
import {
  channel,
  idParams,
  impact,
  interactionCategory,
  interactionType,
  milestoneCategory,
  noteType,
  pagination,
  priority,
} from '../../lib/schemas';

export { idParams };

export const detailsQuery = z.object({});

export const timelineQuery = z.object({ ...pagination(50) });
export const interactionsQuery = z.object({
  ...pagination(50),
  category: interactionCategory.optional(),
});
export const milestonesQuery = z.object({
  ...pagination(20),
  category: milestoneCategory.optional(),
});
export const notesQuery = z.object({ ...pagination(20), noteType: noteType.optional() });

export const addInteractionBody = z.object({
  interactionType,
  channel,
  subject: z.string().trim().max(200).optional(),
  content: z.string().trim().max(10_000).optional(),
  category: interactionCategory.optional(),
  priority: priority.default('normal'),
  responseRequired: z.boolean().default(false),
});

export const addMilestoneBody = z.object({
  milestoneType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  achievedDate: z.coerce.date(),
  category: milestoneCategory.default('general'),
  impact: impact.default('medium'),
});

export const addNoteBody = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.string().trim().min(1).max(10_000),
  noteType: noteType.default('general'),
  isPrivate: z.boolean().default(false),
  isFollowUp: z.boolean().default(false),
  followUpDate: z.coerce.date().optional(),
});
