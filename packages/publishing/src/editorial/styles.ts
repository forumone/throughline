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
.tl-calendar {
  padding-bottom: calc(var(--base) * 3);
}
.tl-calendar__header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: calc(var(--base) * 0.5) var(--base);
  margin-top: calc(var(--base) * 1.5);
}
.tl-calendar__header h1 {
  margin: 0;
}
.tl-calendar__controls {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--base) * 0.75);
}
.tl-calendar__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(var(--base) * 0.5);
  margin: var(--base) 0;
}
.tl-calendar__grid {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.tl-calendar__caption,
.tl-calendar__kind {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.tl-calendar__grid th {
  padding: calc(var(--base) * 0.25);
  color: var(--theme-elevation-500);
  font-weight: normal;
  text-align: left;
}
.tl-calendar__day {
  height: 7.5rem;
  padding: calc(var(--base) * 0.25);
  border: 1px solid var(--theme-elevation-150);
  vertical-align: top;
}
.tl-calendar__day--outside {
  background: var(--theme-elevation-50);
  color: var(--theme-elevation-400);
}
.tl-calendar__day--today .tl-calendar__date {
  border-radius: var(--style-radius-s);
  padding: 0 0.35em;
  background: var(--theme-text);
  color: var(--theme-bg);
}
.tl-calendar__date {
  display: inline-block;
  margin-bottom: 0.25rem;
  font-size: 0.8125rem;
}
/* Kinds differ by border style as well as colour, so the grid does not rely on colour alone. */
.tl-calendar__item {
  display: block;
  margin-top: 2px;
  padding: 1px 0.4em;
  overflow: hidden;
  border: 1px solid transparent;
  border-left-width: 3px;
  border-radius: var(--style-radius-s);
  color: var(--theme-text);
  font-size: 0.8125rem;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tl-calendar__legend .tl-calendar__item {
  display: inline-block;
  margin: 0;
}
.tl-calendar__item--scheduled {
  border-color: var(--theme-warning-500);
  border-style: dashed;
  background: var(--theme-warning-50);
}
.tl-calendar__item--published {
  border-color: var(--theme-success-500);
  background: var(--theme-success-50);
}
.tl-calendar__item--event {
  border-color: var(--theme-elevation-800);
  border-left-width: 6px;
  background: var(--theme-elevation-100);
}
.tl-calendar__more {
  display: block;
  margin-top: 2px;
  font-size: 0.75rem;
}
@media (max-width: 768px) {
  .tl-calendar__day {
    height: 4.5rem;
  }
  .tl-calendar__item {
    font-size: 0;
    height: 0.5rem;
    padding: 0;
  }
}
`
