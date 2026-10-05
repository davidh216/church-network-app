import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Workspace wiring the shared package depends on (root package.json).
type Manifest = {
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
const read = (path: string) =>
  JSON.parse(readFileSync(resolve(__dirname, path), 'utf8')) as Manifest;
const root = read('../../../package.json');
const shared = read('../package.json');

describe('workspace', () => {
  it('zod is one root dependency and a peer of @embrace/shared', () => {
    expect(root.dependencies?.zod).toBe(shared.peerDependencies?.zod);
    expect(shared.dependencies?.zod).toBeUndefined();
  });

  it('npm run dev rebuilds @embrace/shared in watch mode next to the API and the web app', () => {
    const dev = root.scripts.dev!;
    const commands = [...dev.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(commands).toEqual([
      'npm run -w @embrace/shared build -- --watch --preserveWatchOutput',
      'npm run -w backend dev',
      'npm run -w frontend dev',
    ]);
    expect(dev).toMatch(/--names shared,api,web /);
    expect(dev).toMatch(/--prefix-colors yellow,blue,magenta /);
  });
});
