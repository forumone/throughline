---
'@forumone/throughline': minor
---

Error toasts stay until they are read, and a failed save takes the editor to the field that is wrong. (forumone-2026#805)

- **Go to the first error.** After a Save, Publish or Schedule that fails — never after an autosave — the admin opens the tab or collapsed block or array row the first invalid field is in, scrolls it into view below the sticky header (a jump instead of a smooth scroll under `prefers-reduced-motion`) and focuses its input. The publishing plugin registers it as `FirstErrorProvider` in `admin.components.providers`; `publishing.goToFirstError: false` leaves it out. `goToFirstError()` is exported from `@forumone/throughline/client` for a host's own controls.
- **Run `payload generate:importmap` after upgrading.** A provider missing from the import map renders nothing, and since a provider wraps the whole admin, the admin would render blank.
- **Errors stay until closed, and replace rather than stack.** The Publish, Unpublish, Schedule and Sync controls' error toasts last until dismissed and carry a stable id per document, so a second click replaces the first toast. A blocked publish or schedule with marked fields has a **Show me** action. A success clears the error.
- **Cancelling a schedule when nothing was scheduled** says "There was nothing scheduled." rather than "Schedule cancelled". The Schedule control's other text is rewritten too, and its times use the same `Tue 6 Oct 2026, 9:00 am EDT` form as every other date.
