# First Claude connection

End state: Claude Desktop (or Claude Code) connected to your local Throughline server, able to read your design system, compose layouts against it, and publish or request approval for a page.

Prerequisite: you've completed [Scaffolding a project](scaffolding-a-project.md) and have `pnpm dev` running.

## What's at stake

One endpoint, one key, every tool: `POST /api/mcp`, served by
`@payloadcms/plugin-mcp`.

| Tools | Capability |
| --- | --- |
| Components | `list_components`, `get_contract`, `get_variants`, `get_tokens`, `suggest_for_intent`, `validate_composition`, `find_anti_pattern` |
| Publishing | `publish`, `unpublish`, `schedule_publish`, `get_publish_status`, `rollback` |
| Approvals | `request_approval`, `respond_to_approval`, `get_approval_status`, `list_pending_approvals`, `list_my_requests` |
| Audit | `query_audit`, `get_change_history`, `who_changed_what`, `what_changed_in_range`, `get_recent_failures` — read-only |
| Integrations | `list_integrations`, `get_integration_status`, `trigger_sync`, `test_integration`, `list_integration_types` |
| Job failures, fields | `list_job_failures`, `check_slug` — always on |

That is what the scaffold's `throughline()` call turns on. A site that adds the
`editorial` key gets `find_content_needing_attention`, `get_content_calendar`,
`list_my_work` and `search_content`; one that adds `references` gets
`find_references` and `can_delete`.

Each plugin declares its tools to one collector while the config is built;
`throughline()` creates that collector and the host passes it to `mcpPlugin` as
`suite.mcpTools`. There is nothing per-server to configure in your client.
Payload's own generic CRUD tools (`findPages`, `createPages`, `updatePages`, …)
are available too, but only over collections the host opts in through
`mcpPlugin`'s `collections` option — and the scaffold opts in none.

In 0.x this was six endpoints with six keys, each key an env var. If you have a
client configured that way, replace all six entries with the one below.

## Make a key

Payload admin → **MCP** → **API Keys** → new document. In the scaffold only an
admin can open that collection (`mcpApiKeyAccess(isAdmin)` in `payload.config.ts`).

- **User** — filled in for you and not editable: a key is bound to whoever creates
  it. It inherits that user's access control, and every tool logs that user as the
  actor. To get a key that acts as somebody else, that person creates it.
- **Label** — anything; it is how you will recognise the key later.
- Tick **Enable API Key**, save, and copy the key.

## Claude Desktop

Edit your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "throughline": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3000/api/mcp",
        "--header",
        "Authorization: Bearer ${THROUGHLINE_API_KEY}"
      ],
      "env": {
        "THROUGHLINE_API_KEY": "<paste your key>"
      }
    }
  }
}
```

Restart Claude Desktop. The hammer icon next to the chat input should show
"throughline" with a green status dot.

## Claude Code

`claude mcp add` writes the same shape into Claude Code's config:

```bash
claude mcp add throughline http://localhost:3000/api/mcp \
  --header "Authorization: Bearer $THROUGHLINE_API_KEY"
```

## Or check it with curl first

Worth doing before involving a client, because it separates "the server is wrong"
from "my client config is wrong":

```bash
curl -sS -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $THROUGHLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | sed -n 's/^data: //p' | jq '.result.tools | length'
```

Two things about that command. The transport is stateless, so a bare `tools/list`
works with no `initialize` handshake. And the response is SSE-framed — `event:` and
`data:` lines — so `jq` on the raw body fails with `Invalid numeric literal`; the
`sed` is what unwraps it. `Accept` must offer `text/event-stream` or the server
answers 406.

A count of `0` with a `200` is the failure worth knowing about: the key
authenticated and every tool was gated off. Check the **Tools** panel on the key
document — every checkbox there should be ticked on a new key. If the panel is
missing entirely, a server is registered *after* `mcpPlugin` in the host's plugin
array, so its tools were declared into an array that had already been read. See
[`throughline()`](../reference/throughline.md#throughline): `suite.plugin` goes before `mcpPlugin` in `plugins`.

## Test the connection

Ask Claude:

```
List the components available in my design system.
```

Claude should call `list_components` and, with the reference design system, return its 12 components, each with a brief description. If the call fails with `401 Unauthorized`, the API key is wrong or wasn't picked up — restart your client and double-check the key in its config.

```
Draft a homepage for a climate nonprofit. Use the Hero, Stats, and CTASection components.
```

Claude should reach for `suggest_for_intent` or `get_contract` to pick and fill the components, then `validate_composition` to check the layout against the design system's rules (known components and variants, no forbidden neighbours, per-page limits, required siblings present) before showing it to you.

## The rest

There is no "rest" to add — the one entry carries every server's tools. For the
tool-by-tool reference, see the [reference section](../reference/).

## Troubleshooting

- **`401 Unauthorized`** — the key is wrong, disabled, or was never enabled. Check **Enable API Key** on the key document in the Payload admin. Nothing reads a key from `.env.local`.
- **`200` with an empty tool list** — authentication worked and per-tool gating denied everything. Look at the **Tools** panel on the key: a missing panel means a server is registered after `mcpPlugin`, and unticked boxes are just unticked boxes.
- **One tool refused while others work** — its checkbox is off on that key. Tools default to on when a key is created, so this is somebody's choice, including a key created before that tool existed.
- **`406 Not Acceptable`** — your `Accept` header doesn't offer `text/event-stream`.
- **A tool you expected is missing** — the plugin that owns it is off: its key is not in the `throughline()` call (`editorial` and `references` are not, in the scaffold). A plugin wired by hand without the `mcpTools` collector is the same. Nothing errors in either case; its tools are simply absent.
- **`fetch failed`** — your local server isn't running or is on a different port. Confirm `pnpm dev` is up at `http://localhost:3000`.
- **Tools don't appear in Claude** — restart your MCP client after editing config. Many clients only read the config file at startup.
- **Claude calls a tool and it returns an error instead of a result** — the tool refused for the key's user. The publishing tools enforce the collection's own access rules as that user. `respond_to_approval` refuses a user who is not in one of the request's approver `groups`, and anyone deciding their own request. Change the user in the Payload admin, or use a key bound to somebody else.

## Next

[First publish](first-publish.md) walks through the publishing pipeline end-to-end and shows how policy gates fire.
