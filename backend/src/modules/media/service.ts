import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import {
  normalizeMediaTag,
  youtubeVideoId,
  type createMediaInput,
  type listMediaQuery,
} from '@embrace/shared';
import { prisma } from '../../lib/prisma';
import { HttpError } from '../../lib/http-error';
import { escapeLike } from '../../lib/like';

const withUploader = {
  uploadedBy: { select: { id: true, name: true } },
} satisfies Prisma.MediaInclude;

// `videoId` is derived at read time so rows stored before strict validation still load; it is
// null when the stored URL is not a recognisable YouTube link.
function withVideoId<T extends { url: string }>(media: T): T & { videoId: string | null } {
  return { ...media, videoId: youtubeVideoId(media.url) };
}

// Ids of the media whose tag list holds `tag`. Every stored tag is in the tag form (new tags are
// normalised on create, legacy ones by the 20261006030000 migration), so the query is put in that
// form too and either spelling matches: 'Youth Night' and 'youth-night' find 'youth-night'.
async function mediaIdsWithTag(tag: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "media" WHERE ${normalizeMediaTag(tag)} = ANY ("tags")`;
  return rows.map((row) => row.id);
}

// Ids of the media with a tag containing `text`, ignoring case and matching literally (strpos,
// not LIKE). The text's tag form also counts, so "special event" finds 'special-event'.
async function mediaIdsWithTagContaining(text: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "media"
     WHERE EXISTS (SELECT 1 FROM unnest("tags") AS t
                    WHERE strpos(lower(t), lower(${text})) > 0
                       OR strpos(lower(t), ${normalizeMediaTag(text)}) > 0)`;
  return rows.map((row) => row.id);
}

// Approved public media, newest first, one page at a time. Text search ignores case and matches
// literally in the title, the description or any tag; the tag filter matches a whole tag,
// ignoring case.
export async function listMedia(query: z.output<typeof listMediaQuery>) {
  const where: Prisma.MediaWhereInput = { isPublic: true, isApproved: true };
  if (query.type) where.type = query.type;
  if (query.search) {
    const search = escapeLike(query.search);
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { id: { in: await mediaIdsWithTagContaining(query.search) } },
    ];
  }
  if (query.tag && query.tag !== 'all') where.id = { in: await mediaIdsWithTag(query.tag) };

  const { page, pageSize } = query;
  const [rows, total] = await prisma.$transaction([
    prisma.media.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: withUploader,
    }),
    prisma.media.count({ where }),
  ]);
  return { media: rows.map(withVideoId), total, page, pageSize };
}

// Staff-added media is approved and public immediately.
// The URL arrives canonicalised by the schema (https://www.youtube.com/watch?v=<id>).
export async function createMedia(uploadedById: string, body: z.output<typeof createMediaInput>) {
  const media = await prisma.media.create({
    data: {
      title: body.title,
      description: body.description ?? '',
      type: body.type,
      url: body.url,
      tags: body.tags,
      isApproved: true,
      isPublic: true,
      uploadedById,
    },
    include: withUploader,
  });
  return withVideoId(media);
}

export async function getMedia(id: string) {
  const media = await prisma.media.findUnique({ where: { id }, include: withUploader });
  if (!media) throw new HttpError(404, 'Media not found');
  return withVideoId(media);
}
