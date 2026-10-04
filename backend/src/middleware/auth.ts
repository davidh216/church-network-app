import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { selfSelect } from '../modules/users/selects';
import type { AuthenticatedUser, RoleName } from '../types/auth';

export const STAFF: RoleName[] = ['admin', 'leader'];

export function signToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function hasRole(user: AuthenticatedUser, ...roles: RoleName[]): boolean {
  const names = user.roles.map((ur) => ur.role.name);
  return roles.some((role) => names.includes(role));
}

export function isAdmin(user: AuthenticatedUser): boolean {
  return hasRole(user, 'admin');
}

export function isStaff(user: AuthenticatedUser): boolean {
  return hasRole(user, ...STAFF);
}

export const authenticate: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  let userId: string;
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === 'string' || typeof decoded.userId !== 'string') {
      throw new Error('Malformed token payload');
    }
    userId = decoded.userId;
  } catch {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: selfSelect,
  });

  if (!user || !user.isActive) {
    res.status(401).json({ error: 'User not found or inactive' });
    return;
  }

  req.user = user;
  next();
};

export function requireRole(...roles: RoleName[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }
    if (!hasRole(req.user, ...roles)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
