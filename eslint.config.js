import f1BaseConfig from '@forumone/eslint-config-es5'
import { defineConfig, globalIgnores } from 'eslint/config'

/*
The bridge package had no lint either. Same base config as the design system and
the app — this package is the seam between them and should not have a third
house style.
*/
const config = defineConfig([
  ...f1BaseConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    /*
    Every module here puts its exported function first and its private helpers
    below it, which reads top-down: what the file is for, then how. Function
    declarations are hoisted, so this is correct at runtime — the rule is about
    ordering, not about a real reference error.

    Narrowed rather than switched off: `variables` and `classes` stay on,
    because a `const` or a class genuinely used before its definition *is* a
    runtime error.
    */
    rules: {
      '@typescript-eslint/no-use-before-define': [
        'error',
        { functions: false, variables: true, classes: true },
      ],
    },
  },
  globalIgnores(['node_modules']),
])

export default config
