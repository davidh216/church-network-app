import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRISMA_ENUMS } from '@embrace/shared';

// Guards for the Phase 2 F7 polish: Tailwind v4 names, built-in line-clamp, light-only colours,
// browser-locale dates and the `@/` alias for cross-directory imports.
const SRC = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const files = sources(SRC).map((path) => ({ path, text: readFileSync(path, 'utf8') }));
const offenders = (pattern: RegExp) =>
  files.filter(({ text }) => pattern.test(text)).map(({ path }) => path.slice(SRC.length + 1));

describe('frontend polish guards', () => {
  it('uses the Tailwind v4 names for renamed utilities', () => {
    // v3 names whose v4 meaning changed: bare shadow/rounded, shadow-sm (now shadow-xs),
    // bg-gradient-to-* (now bg-linear-to-*), outline-none (now outline-hidden).
    const boundary = '(?<=[\\s"\'`:])';
    const end = '(?=[\\s"\'`]|$)';
    expect(offenders(new RegExp(`${boundary}bg-gradient-to-`, 'm'))).toEqual([]);
    expect(offenders(new RegExp(`${boundary}(rounded|shadow|outline-none)${end}`, 'm'))).toEqual(
      [],
    );
  });

  it('formats dates in the browser locale, never a hard-coded en-US', () => {
    expect(offenders(/['"]en-US['"]/)).toEqual([]);
  });

  it('imports across directories through the @/ alias', () => {
    expect(offenders(/from '\.\.\//)).toEqual([]);
  });

  it('relies on the built-in line-clamp and keeps the body colours light-only', () => {
    const css = readFileSync(join(SRC, 'app', 'globals.css'), 'utf8');
    expect(css).not.toMatch(/\.line-clamp-\d/);
    expect(css).not.toMatch(/prefers-color-scheme:\s*dark/);
    expect(css).toMatch(/color-scheme:\s*light/);
  });

  it('uses the Geist font next/font loads, and honours reduced motion', () => {
    const css = readFileSync(join(SRC, 'app', 'globals.css'), 'utf8');
    expect(css).not.toMatch(/Arial/);
    expect(css).toMatch(/font-family:\s*var\(--font-geist-sans\), system-ui, sans-serif;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it('hides every inline SVG icon from assistive technology (they are all decorative)', () => {
    const unhidden = files.flatMap(({ path, text }) =>
      [...text.matchAll(/<svg\b[^>]*>/g)]
        .filter(([tag]) => !tag.includes('aria-hidden="true"'))
        .map(() => path.slice(SRC.length + 1)),
    );
    expect(unhidden).toEqual([]);
  });

  it('uses only Tailwind type sizes that exist (text-md is not one)', () => {
    expect(offenders(/(?<=[\s"'`])text-md(?=[\s"'`])/)).toEqual([]);
  });

  it('takes enum lists from @embrace/shared instead of repeating them as string literals', () => {
    // Three or more values of one shared enum quoted close together are a restated list (select
    // options, filter choices); iterate the shared tuple instead. A query that names one or two
    // values, or a record keyed by enum values (bare keys, typed with the shared enum), is fine.
    const allowed: Record<string, string[]> = {
      // The engagement score bands are named high/medium/low but are score ranges, not risk or impact.
      'lib/members/filters.ts': ['RiskLevel', 'Impact'],
    };
    const WINDOW = 160;
    const restated = files.flatMap(({ path, text }) => {
      const file = path.slice(SRC.length + 1);
      const quoted = [...text.matchAll(/'([A-Za-z_]+)'|"([A-Za-z_]+)"/g)].map((m) => ({
        value: m[1] ?? m[2]!,
        at: m.index,
      }));
      return Object.entries(PRISMA_ENUMS)
        .filter(([name, values]) => values.length >= 3 && !allowed[file]?.includes(name))
        .filter(([, values]) =>
          quoted.some(({ at }) => {
            const near = quoted.filter((q) => q.at >= at && q.at < at + WINDOW).map((q) => q.value);
            return new Set(near.filter((v) => (values as readonly string[]).includes(v))).size >= 3;
          }),
        )
        .map(([name]) => `${file}: ${name}`);
    });
    expect(restated).toEqual([]);
  });
});
