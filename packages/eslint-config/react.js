import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import base from './index.js'

/**
 * React flat config. Extends the base with React + React Hooks rules.
 * Consume from React packages (reference DS, client apps).
 */
export default [
  ...base,
  {
    files: ['**/*.{jsx,tsx}'],
    ...react.configs.flat.recommended,
    settings: {
      react: { version: 'detect' },
    },
  },
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
]
