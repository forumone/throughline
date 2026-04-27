import base from '@forumone/throughline-eslint-config'

export default [
  ...base,
  {
    ignores: ['dist/**', 'src/templates/**', 'scripts/**'],
  },
]
