import base from '@forumone/throughline-eslint-config'

export default [
  ...base,
  {
    ignores: ['.next/**', 'src/app/(payload)/admin/importMap.js'],
  },
]
