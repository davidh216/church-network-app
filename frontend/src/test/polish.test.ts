import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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
});
