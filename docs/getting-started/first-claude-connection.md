# First Claude connection

End state: Claude Desktop (or Claude Code) connected to your local Throughline server, able to list pages, draft new content, and request a publish.

Prerequisite: you've completed [Scaffolding a project](scaffolding-a-project.md) and have `pnpm dev` running.

## What's at stake

Throughline exposes six MCP servers, each with its own URL and its own API key:

| Server | Endpoint | Capability |
| --- | --- | --- |
| Components | `/api/components/mcp` | propose components, validate compositions |
| Publishing | `/api/publishing/mcp` | publish, schedule, rollback |
| Approvals | `/api/approvals/mcp` | request, list, decide on approvals |
| Audit | `/api/audit/mcp` | read-only queries over the audit log |
| Forms | `/api/forms/mcp` | manage form definitions and submissions |
| Integrations | `/api/integrations/mcp` | trigger and inspect third-party integrations |

Plus the Payload Plugin MCP (`@payloadcms/plugin-mcp`) at `/api/payload/mcp`, which exposes generic CRUD over collections you opt in.

You don't have to wire all of them at once. Start with Components + Publishing — those are the core authoring loop.

## Claude Desktop

Edit your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "throughline-components": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3000/api/components/mcp",
        "--header",
        "Authorization: Bearer ${COMPONENT_SERVER_API_KEY}"
      ],
      "env": {
        "COMPONENT_SERVER_API_KEY": "<paste your key>"
      }
    },
    "throughline-publishing": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3000/api/publishing/mcp",
        "--header",
        "Authorization: Bearer ${PUBLISHING_SERVER_API_KEY}"
      ],
      "env": {
        "PUBLISHING_SERVER_API_KEY": "<paste your key>"
      }
    }
  }
}
```

Restart Claude Desktop. The hammer icon next to the chat input should show "throughline-components" and "throughline-publishing" with green status dots.

## Claude Code

`claude mcp add` writes the same shape into Claude Code's config:

```bash
claude mcp add throughline-components http://localhost:3000/api/components/mcp \
  --header "Authorization: Bearer $COMPONENT_SERVER_API_KEY"

claude mcp add throughline-publishing http://localhost:3000/api/publishing/mcp \
  --header "Authorization: Bearer $PUBLISHING_SERVER_API_KEY"
```

## Test the connection

Ask Claude:

```
List the components available in my design system.
```

Claude should call `propose_components` (or `list_components`, depending on the tool name in your version) and return the 12 reference components, each with its categories and a brief description. If the call fails with `401 Unauthorized`, the API key is wrong or wasn't picked up — restart your client and double-check the env var.

```
Draft a homepage for a climate nonprofit. Use the Hero, Stats, and CTASection components.
```

Claude should call `propose_components` to vet the choices and return a JSON layout that satisfies the design system's rules (correct slot fills, valid prop combinations, no anti-pattern violations).

## Add the rest

When you're ready, add the remaining four servers (Approvals, Audit, Forms, Integrations) the same way. Each has its own API key and endpoint.

For server-by-server tool reference, see the [reference section](../reference/).

## Troubleshooting

- **`401 Unauthorized`** — wrong API key, or the key in `.env.local` doesn't match the one in the Payload admin's API Keys collection. Restart `pnpm dev` after changing `.env.local`.
- **`fetch failed`** — your local server isn't running or is on a different port. Confirm `pnpm dev` is up at `http://localhost:3000`.
- **Tools don't appear in Claude** — restart your MCP client after editing config. Many clients only read the config file at startup.
- **Claude calls a tool but it returns "denied"** — your user doesn't have the required role. Tools that mutate content require `admin` or `editor`; approval-related tools require `approver`; form-admin tools require `form-admin`. Edit your user in the Payload admin and re-fetch the user list in Claude.

## Next

[First publish](first-publish.md) walks through the publishing pipeline end-to-end and shows how policy gates fire.
