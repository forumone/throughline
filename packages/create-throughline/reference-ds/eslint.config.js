import base from '@forumone/throughline-eslint-config'

export default [
  ...base,
  {
    ignores: ['dist/**', 'storybook-static/**', '.storybook/**/*.d.ts'],
  },
  {
    // CLI scripts legitimately use console for output.
    files: ['scripts/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Storybook config files use default exports per its API.
    files: ['.storybook/**/*.{ts,tsx,js}'],
    rules: {
      'import-x/no-default-export': 'off',
    },
  },
]
