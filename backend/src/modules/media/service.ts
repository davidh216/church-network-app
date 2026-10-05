import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { HttpError } from '../../lib/http-error';
import type { createMediaBody, listMediaQuery } from './schemas';

const withUploader = {
  uploadedBy: { select: { id: true, name: true } },
} satisfies Prisma.MediaInclude;

// Approved public media, newest first. Text search and the tag filter ignore case.
export function listMedia(query: z.output<typeof listMediaQuery>) {
  const where: Prisma.MediaWhereInput = { isPublic: true, isApproved: true };
  if (query.type) where.type = query.type;
  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.tag && query.tag !== 'all') where.tags = { contains: query.tag, mode: 'insensitive' };

  return prisma.media.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: query.limit,
    include: withUploader,
  });
}

// Staff-added media is approved and public immediately.
export function createMedia(uploadedById: string, body: z.output<typeof createMediaBody>) {
  return prisma.media.create({
    data: {
      title: body.title,
      description: body.description ?? '',
      type: body.type,
      url: body.url,
      tags: JSON.stringify(body.tags),
      isApproved: true,
      isPublic: true,
      uploadedById,
    },
    include: withUploader,
  });
}

export async function getMedia(id: string) {
  const media = await prisma.media.findUnique({ where: { id }, include: withUploader });
  if (!media) throw new HttpError(404, 'Media not found');
  return media;
}
