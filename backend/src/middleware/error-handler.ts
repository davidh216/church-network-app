import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { HttpError } from '../lib/http-error';

// Prisma request errors that are the caller's fault, with the status they map to.
const PRISMA_STATUS: Record<string, { status: number; error: string }> = {
  P2025: { status: 404, error: 'Not found' },
  P2002: { status: 409, error: 'Already exists' },
  P2003: { status: 400, error: 'Referenced record does not exist' },
};

// A 4xx status carried by an error (body-parser 413/415, http-errors, ...), if any.
function clientErrorStatus(err: object): number | undefined {
  const { status, statusCode } = err as { status?: unknown; statusCode?: unknown };
  const code = typeof status === 'number' ? status : typeof statusCode === 'number' ? statusCode : undefined;
  return code !== undefined && code >= 400 && code <= 499 ? code : undefined;
}

// Every error response follows the shared contract: { error, code?, details? }.
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json(err.code ? { error: err.message, code: err.code } : { error: err.message });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid request', code: 'VALIDATION', details: z.flattenError(err).fieldErrors });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = PRISMA_STATUS[err.code];
    if (mapped) {
      res.status(mapped.status).json({ error: mapped.error });
      return;
    }
  }
  if (err instanceof jwt.JsonWebTokenError) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  if (err && typeof err === 'object') {
    if ('type' in err && err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Malformed JSON body' });
      return;
    }
    const status = clientErrorStatus(err);
    if (status !== undefined) {
      const { expose, message } = err as { expose?: unknown; message?: unknown };
      res.status(status).json({ error: expose === true && typeof message === 'string' ? message : 'Bad request' });
      return;
    }
  }
  req.log.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'Internal server error', requestId: req.id });
};
