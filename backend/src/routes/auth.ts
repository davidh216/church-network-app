import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, signToken } from '../middleware/auth';
import { parseOr400 } from '../lib/validation';
import { selfSelect } from '../lib/user-selects';

const router = express.Router();

const registerSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(50).optional(),
});

// Self-registration creates an INACTIVE account. An admin or leader activates it.
router.post('/register', async (req, res) => {
  const body = parseOr400(registerSchema, req.body, res);
  if (!body) return;

  const email = body.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(400).json({ error: 'Registration could not be completed' });
    return;
  }

  const hashed = await bcrypt.hash(body.password, 10);
  const memberRole = await prisma.role.findUnique({ where: { name: 'member' } });

  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      name: body.name,
      phone: body.phone ?? null,
      isActive: false,
      roles: memberRole ? { create: [{ roleId: memberRole.id }] } : undefined,
    },
    select: { id: true, email: true, name: true, isActive: true, createdAt: true },
  });

  res.status(201).json({
    success: true,
    pendingApproval: true,
    message: 'Account created. A church administrator must approve it before you can sign in.',
    user,
  });
});

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

router.post('/login', async (req, res) => {
  const body = parseOr400(loginSchema, req.body, res);
  if (!body) return;

  // The password hash is omitted globally; select it back in for the comparison only.
  const user = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase() },
    select: { ...selfSelect, password: true },
  });

  if (!user || !(await bcrypt.compare(body.password, user.password))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  if (!user.isActive) {
    res.status(401).json({ error: 'Account is awaiting approval or has been deactivated' });
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const { password: _password, ...safeUser } = user;
  res.json({ success: true, user: safeUser, token: signToken(user.id) });
});

// req.user is loaded with selfSelect by `authenticate`.
router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, user: req.user });
});

export default router;
