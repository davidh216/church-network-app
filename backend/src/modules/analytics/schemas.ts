import { z } from 'zod';
import { idParams } from '../../lib/schemas';

export { idParams };

export const noInputQuery = z.object({});

// GET /api/analytics/jobs/:id: job ids are UUIDs.
export const jobParams = z.object({ id: z.uuid({ error: 'Invalid job id' }) });
