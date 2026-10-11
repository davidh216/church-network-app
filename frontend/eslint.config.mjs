import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default defineConfig([
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'node_modules/**',
    'next-env.d.ts',
    'test-results/**',
    'playwright-report/**',
  ]),
  ...nextVitals,
  ...nextTs,
  // Phase 2 (F4): the full jsx-a11y recommended set, as errors. Only its rules: the Next config
  // already registers the jsx-a11y plugin, and registering it a second time fails.
  { rules: jsxA11y.flatConfigs.recommended.rules },
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
    // Test probes record what a hook returned in a variable outside the component, so the test
    // can assert on it after render. That is a side effect React must avoid in app code, which
    // is why the rule stays on everywhere else (decision P4-D5).
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      'react-hooks/globals': 'off',
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
]);
