import type { Response } from 'express';
import { z } from 'zod';

// Minimal request parsing helper used until the Phase 1 validation middleware lands.
export function parseOr400<T extends z.ZodType>(schema: T, data: unknown, res: Response): z.infer<T> | undefined {
  const result = schema.safeParse(data);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid request', details: z.flattenError(result.error).fieldErrors });
    return undefined;
  }
  return result.data;
}

// Every primary key in the schema is a Prisma cuid().
export const idParam = z.object({ id: z.string().cuid() });
