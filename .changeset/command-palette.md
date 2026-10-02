---
'@forumone/throughline-publishing': minor
---

Adds the Cmd-K command palette and the sidebar's Reports group, moved from forumone-2026, and the `search_content` MCP tool. Additive.

- `editorialPlugin({ palette: { sources } })` mounts `CommandPalette` as an admin provider. From any admin screen, Cmd-K or Ctrl-K finds a document by title in any searched collection, drafts included, or jumps to a collection, global or report. Before anything is typed, it shows what the person recently opened, kept in Payload's per-user preferences. `preferenceKey` keeps an existing list across a move.
- `search_content` runs the query the palette sends: `searchWhere`, from which the palette's REST URL is also written. It ranks results the same way, as the caller.
- The plugin builds the list of reports from the views it registered (content health, the calendar) plus `reports`. It gives that list to the palette's "Go to" and to a sidebar "Reports" group (`ReportsNav`), added after the collections. `reportsNav: false` leaves the sidebar alone.
- `CommandPalette` and `ReportsNav` are at `/client`. The pure half (`searchUrl`, `matchRank`, `matchCommands`, the recent list) is at `/editorial`.

The tool adds a checkbox to `payload-mcp-api-keys`, so a site that passes `mcpTools` needs a migration.
