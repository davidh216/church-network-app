import { z } from 'zod';

export const registerBody = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(50).optional(),
});

export const loginBody = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});
