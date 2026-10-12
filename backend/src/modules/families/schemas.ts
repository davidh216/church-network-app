import { z } from 'zod';
import { cuid } from '@embrace/shared';

// Route-local schemas of /api/families; the bodies and the list query live in @embrace/shared.

// /api/families/:id/members/:userId
export const familyMemberParams = z.object({ id: cuid, userId: cuid });

// /api/families/:id/relationships/:relationshipId
export const familyRelationshipParams = z.object({ id: cuid, relationshipId: cuid });
