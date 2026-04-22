import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import importX from 'eslint-plugin-import-x'
import globals from 'globals'

/**
 * Base ESLint flat config for @forumone/throughline packages.
 *
 * Consume from a package's `eslint.config.js`:
 *   import base from '@forumone/throughline-eslint-config'
 *   export default [...base, { files: ['src/**'], rules: {} }]
 */
export default [
  {
    ignores: ['dist/**', 'build/**', '.next/**', '.turbo/**', 'coverage/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      'import-x': importX,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'import-x/no-default-export': 'warn',
      'no-console': 'warn',
    },
  },
  {
    // Default-export friendly contexts: Next.js pages/layouts, Storybook stories, Payload config.
    files: [
      '**/app/**/{page,layout,loading,error,not-found,template,default,route}.{ts,tsx,js,jsx}',
      '**/pages/**/*.{ts,tsx,js,jsx}',
      '**/*.stories.{ts,tsx,js,jsx}',
      '**/payload.config.{ts,js}',
      '**/next.config.{ts,js,mjs,cjs}',
      '**/vitest.config.{ts,js}',
      '**/eslint.config.{ts,js,mjs,cjs}',
    ],
    rules: {
      'import-x/no-default-export': 'off',
    },
  },
  {
    // Test files: allow console, relax a few TS rules.
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
]
