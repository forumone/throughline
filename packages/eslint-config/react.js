import { createRequire } from 'node:module'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import base from './index.js'

/*
eslint-plugin-react's `version: 'detect'` calls context.getFilename(), which
ESLint 10 removed, so every rule crashes on load. Detect it here instead, the
same way: React as resolved from where eslint runs, or the plugin's own
"assume latest" fallback when there is none.
*/
function detectReactVersion() {
  try {
    return createRequire(`${process.cwd()}/`)('react/package.json').version
  } catch {
    return '999.999.999'
  }
}

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
      react: { version: detectReactVersion() },
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
