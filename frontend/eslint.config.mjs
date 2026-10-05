import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'node_modules/**',
      'next-env.d.ts',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  // Phase 2 (F4): the full jsx-a11y recommended set, as errors.
  ...compat.extends('plugin:jsx-a11y/recommended'),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'react-hooks/rules-of-hooks': 'error',
      // Avatars stay <img loading="lazy" alt> because their hosts are user-supplied (decision
      // P2-3); YouTube thumbnails use next/image. Each remaining <img> carries a disable comment.
      '@next/next/no-img-element': 'error',
    },
  },
  {
    // Phase 2 (F3): component and route files stay small; tests are exempt.
    files: ['src/components/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
];

export default eslintConfig;
