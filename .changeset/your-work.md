---
'@forumone/throughline-publishing': minor
---

Adds "Your work", moved from forumone-2026: dashboard panels for unpublished changes (newest first) and scheduled publishes (soonest first), and the `list_my_work` MCP tool, both from one read. Additive.

- `editorialPlugin({ work: { collections } })` puts `YourWorkDashboard` first in `beforeDashboard`. It shows the two panels, and content health's counts beside them when `health` is configured. `dashboard: false` keeps the tool and leaves the dashboard alone.
- The lists are everything waiting that the viewer can open, not only what they edited, because nothing records who edited what. The tool's description says so.
- `readYourWork` is the read, and `YourWorkReport` the pure panels, at `/rsc`.

The tool adds a checkbox to `payload-mcp-api-keys`, so a site that passes `mcpTools` needs a migration.
