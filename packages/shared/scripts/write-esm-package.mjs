// Marks dist/esm (the bundler build) as ES modules; dist itself stays CommonJS for Node.
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('dist/esm', { recursive: true });
writeFileSync('dist/esm/package.json', '{ "type": "module" }\n');
