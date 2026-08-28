# First Claude connection

End state: Claude Desktop (or Claude Code) connected to your local Throughline server, able to list pages, draft new content, and request a publish.

Prerequisite: you've completed [Scaffolding a project](scaffolding-a-project.md) and have `pnpm dev` running.

## What's at stake

One endpoint, one key, every tool: `POST /api/mcp`, served by
`@payloadcms/plugin-mcp`.

| Tools | Capability |
| --- | --- |
| Components | propose components, validate compositions |
| Publishing | publish, schedule, rollback |
| Approvals | request, list, decide on approvals |
| Audit | read-only queries over the audit log |
| Forms | manage form definitions and submissions |
| Integrations | trigger and inspect third-party integrations |

Each plugin builds its tools at `onInit` and hands them to a collector; the host
passes that collector's array to `mcpPlugin`. There is nothing per-server to
configure in your client. Payload's own generic CRUD tools are available too, but
only over collections the host opts in by naming them in `mcpPlugin`.

This used to be six endpoints with six keys, on a JSON-RPC subset of the protocol
written here. If you have a client configured that way, replace all six entries
with the one below.

## Make a key

Payload admin → **MCP** → **Payload MCP API Keys** → new document.

- **User** — required. The key inherits this user's access control, and every tool
  logs it as the actor. A key saved with no user is a 500 on first use, not a 401.
- **Label** — anything; it is how you will recognise the key later.
- Tick **Enable API Key**, save, and copy the key. It is shown once.

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

A count of `0` with a `200` is the failure worth knowing about: it means the key
authenticated but every tool was gated off. See the note on `overrideAuth` in
[the core reference](../reference/core.md#mcp-handing-tools-to-payloads-server).

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

## The rest

There is no "rest" to add — the one entry carries every server's tools. For the
tool-by-tool reference, see the [reference section](../reference/).

## Troubleshooting

- **`401 Unauthorized`** — the key is wrong, disabled, or was never enabled. Check **Enable API Key** on the key document in the Payload admin. Nothing here reads a key from `.env.local`.
- **`200` with an empty tool list** — authentication worked and gating denied everything. The host needs `overrideAuth`; see [the core reference](../reference/core.md#mcp-handing-tools-to-payloads-server).
- **`406 Not Acceptable`** — your `Accept` header doesn't offer `text/event-stream`.
- **A tool you expected is missing** — the plugin that owns it wasn't given the `mcpTools` collector. Nothing errors in that case; its tools are simply absent.
- **`fetch failed`** — your local server isn't running or is on a different port. Confirm `pnpm dev` is up at `http://localhost:3000`.
- **Tools don't appear in Claude** — restart your MCP client after editing config. Many clients only read the config file at startup.
- **Claude calls a tool but it returns "denied"** — your user doesn't have the required role. Tools that mutate content require `admin` or `editor`; approval-related tools require `approver`; form-admin tools require `form-admin`. Edit your user in the Payload admin and re-fetch the user list in Claude.

## Next

[First publish](first-publish.md) walks through the publishing pipeline end-to-end and shows how policy gates fire.
