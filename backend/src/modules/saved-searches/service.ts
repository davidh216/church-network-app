import type { Prisma, SavedSearch } from '@prisma/client';
import type { z } from 'zod';
import { searchQuery, type createSavedSearchInput } from '@embrace/shared';
import { prisma } from '../../lib/prisma';
import { HttpError } from '../../lib/http-error';
import { isAdmin } from '../../middleware/auth';
import type { AuthenticatedUser } from '../../types/auth';

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

// Stored queries are validated again on load: one that no longer matches `searchQuery` (written
// before validation existed, or by an older schema) comes back as stored with `invalid: true`, and
// the UI must not apply it.
function loadQuery(raw: string) {
  const stored = parseJson(raw);
  const parsed = searchQuery.safeParse(stored);
  return parsed.success ? { query: parsed.data, invalid: false } : { query: stored, invalid: true };
}

// Who saved a search (public searches are shared, so the list names their author).
const withCreator = {
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.SavedSearchInclude;

function format(s: SavedSearch & { createdBy?: { id: string; name: string } }) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    ...loadQuery(s.query),
    isPublic: s.isPublic,
    ...(s.createdBy ? { createdBy: s.createdBy } : {}),
    createdAt: s.createdAt,
    usageCount: s.usageCount,
    lastUsed: s.lastUsed,
  };
}

// The caller's own searches plus every public one, most recently used first.
export async function listSavedSearches(userId: string) {
  const searches = await prisma.savedSearch.findMany({
    where: { OR: [{ createdById: userId }, { isPublic: true }] },
    orderBy: [{ lastUsed: 'desc' }, { createdAt: 'desc' }],
    include: withCreator,
  });
  return searches.map(format);
}

export async function createSavedSearch(
  userId: string,
  body: z.output<typeof createSavedSearchInput>,
) {
  const saved = await prisma.savedSearch.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      query: JSON.stringify(body.query),
      isPublic: body.isPublic ?? false,
      createdById: userId,
    },
  });
  const { usageCount: _usageCount, lastUsed: _lastUsed, ...search } = format(saved);
  return search;
}

// Only the author or an admin may delete a search.
export async function deleteSavedSearch(user: AuthenticatedUser, id: string) {
  const search = await prisma.savedSearch.findUnique({ where: { id } });
  if (!search) throw new HttpError(404, 'Search not found');
  if (search.createdById !== user.id && !isAdmin(user))
    throw new HttpError(403, 'Not authorized to delete this search');
  await prisma.savedSearch.delete({ where: { id } });
}

// Counts a use of a search the caller can see (their own or a public one).
export async function useSavedSearch(user: AuthenticatedUser, id: string) {
  const search = await prisma.savedSearch.findUnique({ where: { id } });
  if (!search || (search.createdById !== user.id && !search.isPublic))
    throw new HttpError(404, 'Search not found');
  await prisma.savedSearch.update({
    where: { id },
    data: { usageCount: { increment: 1 }, lastUsed: new Date() },
  });
}
