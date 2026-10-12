import { z } from 'zod';
import { cuid } from '@embrace/shared';

// Route-local schemas of /api/groups; the bodies and the list query live in @embrace/shared.

// /api/groups/:id/members/:userId
export const groupMemberParams = z.object({ id: cuid, userId: cuid });
