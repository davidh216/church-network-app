import { z } from 'zod';

// GET /api/roles takes no input; an empty query object is the whole contract.
export const listRolesQuery = z.object({});
