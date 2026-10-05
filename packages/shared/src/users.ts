import { z } from 'zod';
import { passwordNotEmail, passwordSchema } from './password-policy.js';
import { cuid, emailAddress, labelList, optionalText, requiredText } from './primitives.js';

const roleIds = z.array(cuid).max(10, 'Choose at most 10 roles');

// Profile lists (text[] columns); sending a list replaces the stored one.
export const MAX_PROFILE_LIST_ITEMS = 30;
const volunteerSkills = labelList('Skills', MAX_PROFILE_LIST_ITEMS);
const interests = labelList('Interests', MAX_PROFILE_LIST_ITEMS);

// POST /api/users (staff)
export const createUserInput = z
  .object({
    name: requiredText('Name', 200),
    email: emailAddress,
    password: passwordSchema,
    phone: optionalText('Phone', 50),
    bio: optionalText('Bio', 2000),
    volunteerSkills: volunteerSkills.optional(),
    interests: interests.optional(),
    isActive: z.boolean({ error: 'Status must be true or false' }).optional(),
    roleIds: roleIds.optional(),
  })
  .superRefine(passwordNotEmail);

// PUT /api/users/:id
export const updateUserInput = z.object({
  name: requiredText('Name', 200).optional(),
  phone: optionalText('Phone', 50),
  bio: optionalText('Bio', 2000),
  volunteerSkills: volunteerSkills.optional(),
  interests: interests.optional(),
  isActive: z.boolean({ error: 'Status must be true or false' }).optional(),
  roleIds: roleIds.optional(),
});

// POST /api/users/:id/reset-password (staff)
export const resetPasswordInput = z.object({
  newPassword: passwordSchema,
});

export type CreateUserInput = z.input<typeof createUserInput>;
export type UpdateUserInput = z.input<typeof updateUserInput>;
export type ResetPasswordInput = z.input<typeof resetPasswordInput>;
