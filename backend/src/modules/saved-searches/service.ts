import type { SavedSearch } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { HttpError } from '../../lib/http-error';
import { isAdmin } from '../../middleware/auth';
import type { AuthenticatedUser } from '../../types/auth';
import type { createSavedSearchBody } from './schemas';

function parseQuery(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function format(s: SavedSearch) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    query: parseQuery(s.query),
    isPublic: s.isPublic,
    createdAt: s.createdAt,
    usageCount: s.usageCount,
    lastUsed: s.lastUsed,
  };
}

// The caller's own searches plus every public one, most recently used first.
export async function listSavedSearches(userId: string) {
  const searches = await prisma.savedSearch.findMany({
    where: { OR: [{ createdBy: userId }, { isPublic: true }] },
    orderBy: [{ lastUsed: 'desc' }, { createdAt: 'desc' }],
  });
  return searches.map(format);
}

export async function createSavedSearch(userId: string, body: z.output<typeof createSavedSearchBody>) {
  const saved = await prisma.savedSearch.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      query: JSON.stringify(body.query),
      isPublic: body.isPublic ?? false,
      createdBy: userId,
    },
  });
  const { usageCount: _usageCount, lastUsed: _lastUsed, ...search } = format(saved);
  return search;
}

// Only the author or an admin may delete a search.
export async function deleteSavedSearch(user: AuthenticatedUser, id: string) {
  const search = await prisma.savedSearch.findUnique({ where: { id } });
  if (!search) throw new HttpError(404, 'Search not found');
  if (search.createdBy !== user.id && !isAdmin(user)) throw new HttpError(403, 'Not authorized to delete this search');
  await prisma.savedSearch.delete({ where: { id } });
}

// Counts a use of a search the caller can see (their own or a public one).
export async function useSavedSearch(user: AuthenticatedUser, id: string) {
  const search = await prisma.savedSearch.findUnique({ where: { id } });
  if (!search || (search.createdBy !== user.id && !search.isPublic)) throw new HttpError(404, 'Search not found');
  await prisma.savedSearch.update({
    where: { id },
    data: { usageCount: { increment: 1 }, lastUsed: new Date() },
  });
}
