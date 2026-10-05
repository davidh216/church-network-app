import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The compiled package (built by `npm run build:shared`, which `npm test` runs first): CommonJS
// for Node's require() and an ES module build that bundlers can tree-shake.
const pkgDir = resolve(__dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf8')) as {
  exports: Record<string, unknown>;
  sideEffects?: boolean;
};

// Runs a script in a fresh Node process from the backend workspace, which depends on the package.
const nodeEval = (args: string[]) =>
  execFileSync(process.execPath, args, { cwd: resolve(pkgDir, '../../backend'), encoding: 'utf8' });

describe('package build', () => {
  it('exports types, an ESM entry for import and the CommonJS entry for require', () => {
    expect(manifest.exports['.']).toEqual({
      types: './dist/index.d.ts',
      import: './dist/esm/index.js',
      require: './dist/index.js',
    });
    expect(manifest.sideEffects).toBe(false);
  });

  it('marks dist/esm as ES modules', () => {
    const esm = JSON.parse(readFileSync(resolve(pkgDir, 'dist/esm/package.json'), 'utf8')) as {
      type?: string;
    };
    expect(esm.type).toBe('module');
  });

  it('require() loads the CommonJS build and import loads the ESM build, with the same exports', () => {
    const cjs = nodeEval([
      '-e',
      "const s = require('@embrace/shared'); console.log(JSON.stringify([require.resolve('@embrace/shared'), Object.keys(s).sort()]))",
    ]);
    const esm = nodeEval([
      '--input-type=module',
      '-e',
      "const s = await import('@embrace/shared'); console.log(JSON.stringify([import.meta.resolve('@embrace/shared'), Object.keys(s).sort()]))",
    ]);
    const [cjsPath, cjsKeys] = JSON.parse(cjs) as [string, string[]];
    const [esmUrl, esmKeys] = JSON.parse(esm) as [string, string[]];
    expect(cjsPath).toBe(resolve(pkgDir, 'dist/index.js'));
    expect(esmUrl.endsWith('/packages/shared/dist/esm/index.js')).toBe(true);
    expect(esmKeys).toEqual(cjsKeys.filter((key) => key !== 'default'));
    expect(cjsKeys).toContain('searchQuery');
  });
});
