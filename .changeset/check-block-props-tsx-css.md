---
'@forumone/throughline-design-system-payload': patch
---

`check-block-props` can now load a design system whose args files are TSX and whose components import CSS modules. #207

- `--tsconfig <file>` names the tsconfig that compiles the args files, for its `jsx` setting. Without it, tsx uses the tsconfig beside the working directory, which for a site is the app's rather than the design system's, and an automatic-runtime args file fails with `React is not defined`. A design system that keeps `jsx` in a project reference such as `tsconfig.app.json` has to be named.
- Stylesheet imports (`.css`, `.scss`, `.sass`, `.less`) are stubbed in both the ESM and CommonJS paths. Only the args' shape is compared, and Node cannot load a stylesheet. Before this, `ERR_UNKNOWN_FILE_EXTENSION ".css"` stopped the check.
