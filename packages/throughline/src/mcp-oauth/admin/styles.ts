/*
The MCP pages' styles, in Payload's tokens, rendered as a React 19
`<style href precedence>` like the editorial views'.
*/
export const MCP_CSS = `
.tl-mcp { max-width: 52rem; padding-bottom: calc(var(--base) * 3); }
.tl-mcp h1 { margin-bottom: calc(var(--base) * 0.5); }
.tl-mcp__lede { font-size: 1.05rem; color: var(--theme-elevation-800); }
.tl-mcp__section { margin-top: calc(var(--base) * 2); padding-top: var(--base); border-top: 1px solid var(--theme-elevation-100); }
.tl-mcp__section h2 { font-size: 1.15rem; margin-bottom: calc(var(--base) * 0.5); }
.tl-mcp__section ol, .tl-mcp__section ul { padding-left: 1.25rem; }
.tl-mcp__section li { margin-bottom: calc(var(--base) * 0.4); }
.tl-mcp__copy { display: flex; flex-wrap: wrap; align-items: center; gap: calc(var(--base) * 0.5); margin: calc(var(--base) * 0.5) 0; }
.tl-mcp__value { padding: calc(var(--base) * 0.4) calc(var(--base) * 0.6); border: 1px solid var(--theme-elevation-150); border-radius: var(--style-radius-s); background: var(--theme-elevation-50); font-size: 0.9rem; overflow-wrap: anywhere; }
.tl-mcp__button { display: inline-block; padding: calc(var(--base) * 0.4) calc(var(--base) * 0.9); border-radius: var(--style-radius-s); background: var(--theme-elevation-900); color: var(--theme-elevation-0); text-decoration: none; font-weight: 600; }
.tl-mcp__button:hover, .tl-mcp__button:focus-visible { background: var(--theme-elevation-750); color: var(--theme-elevation-0); }
.tl-mcp__note { color: var(--theme-elevation-600); font-size: 0.9rem; }
.tl-mcp__notice { padding: calc(var(--base) * 0.6) var(--base); border-left: 3px solid var(--theme-warning-500); background: var(--theme-warning-50, var(--theme-elevation-50)); }
.tl-mcp__error { color: var(--theme-error-500); margin: 0; }
.tl-mcp__actions { display: flex; flex-wrap: wrap; align-items: center; gap: calc(var(--base) * 0.5); margin-top: calc(var(--base) * 1.5); }
.tl-mcp__tools { list-style: none; padding: 0; }
.tl-mcp__tools li { margin-bottom: calc(var(--base) * 0.4); }
.tl-mcp__table { width: 100%; border-collapse: collapse; }
.tl-mcp__table th, .tl-mcp__table td { text-align: left; padding: calc(var(--base) * 0.4) calc(var(--base) * 0.5); border-bottom: 1px solid var(--theme-elevation-100); vertical-align: middle; }
.tl-mcp__table th { font-weight: 600; color: var(--theme-elevation-700); }
`
