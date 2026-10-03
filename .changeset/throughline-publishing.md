---
'@forumone/throughline': major
---

Publishing moves in from `@forumone/throughline-publishing`, by `docs/spec/1.0-exports.md`:

- `@forumone/throughline-publishing` and its `/checks` are `@forumone/throughline/publishing`.
- `/editorial` is `@forumone/throughline/editorial`.
- `/client` and `/rsc` are `@forumone/throughline/client` and `/rsc`, beside core's admin components.

Admin component paths follow, so a site's `importMap.js` changes: `@forumone/throughline/client#PublishButton`, `#UnpublishButton`, `#SchedulePublishField`, `#CommandPalette` and `#ReportsNav`, and `@forumone/throughline/rsc#ContentHealthView`, `#ContentCalendarView` and `#YourWorkDashboard`. `next` and `@payloadcms/next` are optional peers, used only by those components.
