import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import { z } from 'zod';

type Schemas = { body?: z.ZodType; query?: z.ZodType; params?: z.ZodType };
type Parsed<S, K extends keyof Schemas, Fallback> = S extends {
  [P in K]: infer T extends z.ZodType;
}
  ? z.output<T>
  : Fallback;

export type ValidationDetails = Record<string, string[]>;

// Field errors of every failed part, keyed by field name. Errors about a part as a whole
// (for example a missing or non-object body) are keyed by the part name.
function collectDetails(part: keyof Schemas, error: z.ZodError, details: ValidationDetails) {
  const { formErrors, fieldErrors } = z.flattenError(error) as {
    formErrors: string[];
    fieldErrors: Record<string, string[] | undefined>;
  };
  if (formErrors.length > 0) details[part] = [...(details[part] ?? []), ...formErrors];
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (messages) details[field] = [...(details[field] ?? []), ...messages];
  }
}

// Parses req.params, req.query and req.body with the given zod schemas and replaces them with
// the parsed values, so the handlers that follow see coerced, typed input. On failure it ends
// the request with 400 { error, code: "VALIDATION", details }.
export function validate<S extends Schemas>(
  schemas: S,
): RequestHandler<
  Parsed<S, 'params', ParamsDictionary>,
  unknown,
  Parsed<S, 'body', unknown>,
  Parsed<S, 'query', ParsedQs>
> {
  return (req, res, next) => {
    const details: ValidationDetails = {};
    const parsed: Partial<Record<keyof Schemas, unknown>> = {};
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (result.success) parsed[part] = result.data;
      else collectDetails(part, result.error, details);
    }
    if (Object.keys(details).length > 0) {
      res.status(400).json({ error: 'Invalid request', code: 'VALIDATION', details });
      return;
    }
    if ('params' in parsed) req.params = parsed.params as typeof req.params;
    if ('body' in parsed) req.body = parsed.body as typeof req.body;
    // Express 5 exposes req.query through a getter; shadow it with the parsed value.
    if ('query' in parsed)
      Object.defineProperty(req, 'query', {
        value: parsed.query,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    next();
  };
}
