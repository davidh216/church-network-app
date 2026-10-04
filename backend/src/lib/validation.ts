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

export const cuidParam = z.object({ id: z.string().min(1).max(64) });
