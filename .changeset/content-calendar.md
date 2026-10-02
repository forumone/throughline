---
'@forumone/throughline-publishing': minor
---

Adds the content calendar, moved from forumone-2026: a month of scheduled publishes, past publishes and events in the admin, and the `get_content_calendar` MCP tool, both from one read. Additive.

- `editorialPlugin({ calendar: { timeZone, collections, events } })` registers the view at `/admin/content-calendar`, as a grid or, with `?view=list`, an agenda, and binds the tool.
- Every item is placed on its day in the site's zone, so every editor sees the same grid. An event entered in another zone shows both times, e.g. "2:00 PM ET (11:00 AM PT)".
- Scheduled publishes are read from the latest version, because a schedule lives on a draft. Publishes are read from the live row, and events with drafts marked as such.
- The field names default to `publishingPlugin`'s (`scheduledPublishAt`, `publishedAt`). `zoneLabel` lets a site name zones its own way.
- `calendarClock(zone)` holds the date arithmetic, and `readCalendarMonth` is the read. Both are exported. `ContentCalendarView` and `ContentCalendarReport` are at `/rsc`.

The tool adds a checkbox to `payload-mcp-api-keys`, so a site that passes `mcpTools` needs a migration.
