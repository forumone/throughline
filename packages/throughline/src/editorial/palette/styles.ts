/*
The palette's styles, in Payload's tokens, rendered as a React 19
`<style href precedence>` like the editorial views'. Kept apart from those
because this ships in the client bundle. Ported from forumone-2026's
`app/(payload)/custom.css`. A native <dialog>, so the backdrop and focus
handling are the browser's.
*/
export const PALETTE_CSS = `
.tl-palette {
  width: min(40rem, calc(100vw - 2rem));
  max-height: min(32rem, calc(100vh - 6rem));
  margin: 10vh auto auto;
  padding: 0;
  border: 1px solid var(--theme-elevation-150);
  border-radius: var(--style-radius-m);
  background: var(--theme-elevation-0);
  color: var(--theme-text);
  box-shadow: 0 1rem 3rem rgb(0 0 0 / 25%);
  overflow: hidden;
}
.tl-palette[open] {
  display: flex;
  flex-direction: column;
}
.tl-palette::backdrop {
  background: rgb(0 0 0 / 40%);
}
.tl-palette__input {
  width: 100%;
  padding: calc(var(--base) * 0.75) var(--base);
  border: 0;
  border-bottom: 1px solid var(--theme-elevation-150);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 1.125rem;
  outline: none;
}
.tl-palette__status,
.tl-palette__keys {
  margin: 0;
  padding: calc(var(--base) * 0.5) var(--base);
  color: var(--theme-elevation-500);
  font-size: 0.875rem;
}
.tl-palette__keys {
  border-top: 1px solid var(--theme-elevation-100);
}
.tl-palette__list {
  flex: 1;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.tl-palette__item {
  display: flex;
  justify-content: space-between;
  gap: var(--base);
  padding: calc(var(--base) * 0.5) var(--base);
  cursor: pointer;
}
.tl-palette__item[aria-selected='true'] {
  background: var(--theme-elevation-100);
}
.tl-palette__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tl-palette__hint {
  flex-shrink: 0;
  color: var(--theme-elevation-500);
}
`
