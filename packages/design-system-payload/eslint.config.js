import base from '@forumone/throughline-eslint-config'

/*
The suite's shared config, not the consuming site's.

This package used `@forumone/eslint-config-es5` when it lived in the site, for a
reason that was right there and is wrong here: it was the seam between the design
system and the app, and a third house style between two would have been noise.
Its neighbours are now the plugins, and their config is the one it should share.
*/
export default [
  ...base,
  {
    /*
    Every module here puts its exported function first and its private helpers
    below it, which reads top-down: what the file is for, then how. Function
    declarations are hoisted, so this is correct at runtime — the rule is about
    ordering, not a real reference error.

    Narrowed rather than switched off: `variables` and `classes` stay on, because
    a `const` or a class genuinely used before its definition *is* one.
    */
    rules: {
      '@typescript-eslint/no-use-before-define': [
        'error',
        { functions: false, variables: true, classes: true },
      ],
    },
  },
  { ignores: ['node_modules/**'] },
]
