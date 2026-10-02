/*
The editorial views' styles, in Payload's own tokens so both admin themes work.

Shipped as a string and rendered as a React 19 `<style href precedence>`, which
React hoists into the head and de-duplicates however many panels render it. A
package cannot rely on the host's `custom.css`, and importing a `.css` file from
a package is a bundler question this avoids. Ported from forumone-2026's
`app/(payload)/custom.css` dashboard and health rules.
*/
export const EDITORIAL_CSS = `
.tl-editorial__panel {
  border: 1px solid var(--theme-elevation-150);
  border-radius: var(--style-radius-m);
  padding: var(--base);
}
.tl-editorial__panel h2 {
  margin: 0 0 calc(var(--base) * 0.5);
  font-size: 1.125rem;
}
.tl-editorial__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.tl-editorial__row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0 var(--base);
  padding: calc(var(--base) * 0.4) 0;
  border-top: 1px solid var(--theme-elevation-100);
}
.tl-editorial__row:first-child {
  border-top: 0;
}
.tl-editorial__meta,
.tl-editorial__empty {
  color: var(--theme-elevation-500);
}
.tl-editorial__empty {
  margin: 0;
}
.tl-editorial__more {
  margin: calc(var(--base) * 0.5) 0 0;
}
.tl-health {
  display: grid;
  gap: var(--base);
  padding-bottom: calc(var(--base) * 3);
}
.tl-health h1 {
  margin: calc(var(--base) * 1.5) 0 0;
}
.tl-health__lede {
  margin: 0;
  color: var(--theme-elevation-500);
}
.tl-health__group h3 {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0 var(--base);
  margin: var(--base) 0 calc(var(--base) * 0.25);
  font-size: 1rem;
}
.tl-health__group h3 a {
  font-weight: normal;
}
`
