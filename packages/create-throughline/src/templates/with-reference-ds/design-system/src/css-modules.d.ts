/* eslint-disable import-x/no-default-export -- CSS Modules loaders emit a default export. */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
