import { z } from 'zod';
import { interactionCategory, milestoneCategory, noteType } from '@embrace/shared';
import { idParams, pagination } from '../../lib/schemas';

export { idParams };
export { timelineQuery } from '@embrace/shared';

export const detailsQuery = z.object({});

export const interactionsQuery = z.object({
  ...pagination(50),
  category: interactionCategory.optional(),
});
export const milestonesQuery = z.object({
  ...pagination(20),
  category: milestoneCategory.optional(),
});
export const notesQuery = z.object({ ...pagination(20), noteType: noteType.optional() });
