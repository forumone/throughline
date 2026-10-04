import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import { redirect } from 'next/navigation.js'
import type { AdminViewServerProps } from 'payload'
import type { ReactNode } from 'react'
import { isLoopback, MCP_CLIENT_RULES } from '../clients.js'
import { unseal } from '../crypto.js'
import {
  keys,
  mcpOAuthRuntime,
  MCP_ACCESS_SLUG,
  MCP_OAUTH_GRANTS_SLUG,
  readPolicy,
  toolsFor,
  type McpOAuthRuntime,
} from '../runtime.js'
import { resolveClient, type PendingRequest } from '../store.js'
import { ConsentActions, CopyValue, RevokeConnectionButton } from './McpClientActions.js'
import { MCP_CSS } from './styles.js'

/*
The two admin pages a person sees: Connect MCP, which says how to connect each
app and lists what they have connected, and the consent screen an app sends
them to.

Both are server components that read the person from `initPageResult.req` —
Payload leaves the `user` prop empty for a custom root view — and send anybody
signed out to the login screen with a way back, which is how an app's sign-in
reaches Okta (or whatever the site signs in with) without this module knowing.
*/

type UserDoc = Record<string, unknown>

function Styles() {
  return (
    <style href="throughline-mcp" precedence="default">
      {MCP_CSS}
    </style>
  )
}

function Page({ props, children }: { props: AdminViewServerProps; children: ReactNode }) {
  const { initPageResult, params, searchParams, payload, i18n } = props
  const { req, permissions, locale, visibleEntities } = initPageResult
  return (
    <DefaultTemplate
      i18n={i18n}
      {...(locale ? { locale } : {})}
      {...(params ? { params } : {})}
      payload={payload}
      permissions={permissions}
      req={req}
      {...(searchParams ? { searchParams } : {})}
      user={req.user as NonNullable<typeof req.user>}
      visibleEntities={visibleEntities}
    >
      <Styles />
      <Gutter className="tl-mcp">{children}</Gutter>
    </DefaultTemplate>
  )
}

function signedInOrLogin(props: AdminViewServerProps, here: string): UserDoc {
  const user = props.initPageResult.req.user as unknown as UserDoc | null
  if (!user) {
    const admin = props.payload.config.routes.admin
    redirect(`${admin}/login?redirect=${encodeURIComponent(here)}`)
  }
  return user
}

function firstSentence(text: string): string {
  const match = /^(.+?[.!?])(\s|$)/.exec(text)
  return (match?.[1] ?? text).trim()
}

function when(value: unknown): string {
  if (typeof value !== 'string') return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function claudeAddUrl(runtime: McpOAuthRuntime): string {
  // Claude's add-connector form, filled in. Two spellings of the parameters
  // are in use; both are sent, and an unknown one is ignored.
  const url = new URL('https://claude.ai/customize/connectors')
  url.searchParams.set('modal', 'add-custom-connector')
  url.searchParams.set('connectorName', runtime.serverName)
  url.searchParams.set('connectorUrl', runtime.resource)
  url.searchParams.set('mcpName', runtime.serverName)
  url.searchParams.set('mcpServerUrl', runtime.resource)
  return url.toString()
}

export async function ConnectMcpView(props: AdminViewServerProps) {
  const { payload } = props
  const runtime = mcpOAuthRuntime(payload.config)
  const admin = payload.config.routes.admin
  const user = signedInOrLogin(props, `${admin}${runtime.connectPath}`)
  const policy = await readPolicy(payload, runtime)
  const verdict = runtime.eligible(user)
  const isAdmin = runtime.isAdmin(user)

  const { docs: connections } = await payload.find({
    collection: MCP_OAUTH_GRANTS_SLUG as never,
    where: {
      and: [{ user: { equals: user['id'] } }, { status: { not_equals: 'pending' } }],
    } as never,
    sort: '-connectedAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  const tools = toolsFor(user, policy, runtime)

  return (
    <Page props={props}>
      <h1>Connect MCP</h1>
      <p className="tl-mcp__lede">
        Connect Claude{policy.clients.chatgpt ? ', ChatGPT' : ''} or Claude Code to{' '}
        {runtime.serverName}, and draft, check and publish content by asking. The app works as you:
        it can do what you can do here, and everything it does is recorded under your name.
      </p>

      {verdict !== true ? (
        <p className="tl-mcp__notice">You can’t connect an app yet. {verdict}</p>
      ) : (
        <>
          <section className="tl-mcp__section">
            <h2>The server’s address</h2>
            <p>
              Every app asks for this. You sign in with your usual {runtime.serverName} login; there
              is no key to copy.
            </p>
            <CopyValue value={runtime.resource} label="Copy address" />
          </section>

          {policy.clients.claude && (
            <section className="tl-mcp__section">
              <h2>Claude — on the web, the desktop app and mobile</h2>
              {runtime.claudeConnector === 'organization' ? (
                <ol>
                  <li>
                    <a
                      className="tl-mcp__button"
                      href="https://claude.ai/customize/connectors"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Claude’s connectors
                    </a>
                  </li>
                  <li>
                    Find <strong>{runtime.serverName}</strong>, marked <em>Custom</em>, and click{' '}
                    <strong>Connect</strong>.
                  </li>
                  <li>
                    Claude sends you here to sign in. Check what it asks for and click{' '}
                    <strong>Allow</strong>.
                  </li>
                </ol>
              ) : (
                <ol>
                  <li>
                    <a
                      className="tl-mcp__button"
                      href={claudeAddUrl(runtime)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Add {runtime.serverName} to Claude
                    </a>{' '}
                    — the form opens with the name and address filled in. If it opens empty, paste
                    the address above.
                  </li>
                  <li>
                    Click <strong>Add</strong>, then <strong>Connect</strong>.
                  </li>
                  <li>
                    Claude sends you here to sign in. Check what it asks for and click{' '}
                    <strong>Allow</strong>.
                  </li>
                </ol>
              )}
              <p className="tl-mcp__note">
                One connection works everywhere you use Claude: claude.ai, the desktop app and the
                mobile apps.
                {runtime.claudeConnector === 'organization' && (
                  <>
                    {' '}
                    Using a personal Claude account instead?{' '}
                    <a href={claudeAddUrl(runtime)} target="_blank" rel="noopener noreferrer">
                      Add it to your own account
                    </a>
                    .
                  </>
                )}
              </p>
            </section>
          )}

          {policy.clients.claudeCode && (
            <section className="tl-mcp__section">
              <h2>Claude Code</h2>
              <p>In a terminal:</p>
              <CopyValue
                value={`claude mcp add --transport http ${runtime.claudeCodeName} ${runtime.resource}`}
              />
              <p>
                Then, inside Claude Code, run <code>/mcp</code>, choose{' '}
                <strong>{runtime.claudeCodeName}</strong> and sign in. Your browser opens here;
                click <strong>Allow</strong>.
              </p>
            </section>
          )}

          {policy.clients.chatgpt && (
            <section className="tl-mcp__section">
              <h2>ChatGPT</h2>
              <p>ChatGPT has no install link, so this takes a few steps, once:</p>
              <ol>
                <li>
                  In ChatGPT, open <strong>Settings → Apps</strong> (or{' '}
                  <strong>Apps &amp; Connectors</strong>) → <strong>Advanced settings</strong>, and
                  turn on <strong>Developer mode</strong>.
                </li>
                <li>
                  Back in <strong>Apps</strong>, choose <strong>Create</strong>. Name it{' '}
                  {runtime.serverName}, paste the address above as the{' '}
                  <strong>MCP server URL</strong>, and choose <strong>OAuth</strong> for
                  authentication.
                </li>
                <li>
                  ChatGPT sends you here to sign in. Check what it asks for and click{' '}
                  <strong>Allow</strong>.
                </li>
              </ol>
              <p className="tl-mcp__note">
                ChatGPT asks you to confirm before each change it makes. Content you work on goes to
                your ChatGPT account, under its own data settings.
              </p>
            </section>
          )}

          <section className="tl-mcp__section">
            <h2>What a connected app can use</h2>
            <p>
              {tools.length === 0
                ? 'Nothing yet: an administrator has not chosen any tools for your role.'
                : tools.join(', ')}
            </p>
          </section>
        </>
      )}

      <section className="tl-mcp__section">
        <h2>Your connected apps</h2>
        {connections.length === 0 ? (
          <p>None yet.</p>
        ) : (
          <table className="tl-mcp__table">
            <thead>
              <tr>
                <th>App</th>
                <th>Connected</th>
                <th>Last used</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(connections as unknown as UserDoc[]).map((grant) => (
                <tr key={String(grant['id'])}>
                  <td>{String(grant['clientName'])}</td>
                  <td>{when(grant['connectedAt'])}</td>
                  <td>{when(grant['lastUsedAt'])}</td>
                  <td>
                    {grant['status'] === 'active'
                      ? 'Connected'
                      : `Disconnected${grant['revokedReason'] ? ` — ${String(grant['revokedReason'])}` : ''}`}
                  </td>
                  <td>
                    {grant['status'] === 'active' && (
                      <RevokeConnectionButton id={grant['id'] as number | string} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {isAdmin && (
        <section className="tl-mcp__section">
          <h2>For administrators</h2>
          <ul>
            <li>
              <a href={`${admin}/collections/${MCP_OAUTH_GRANTS_SLUG}`}>
                Everyone’s connected apps
              </a>{' '}
              — and disconnect any of them.
            </li>
            <li>
              <a href={`${admin}/globals/${MCP_ACCESS_SLUG}`}>MCP access</a> — which apps may
              connect, and which tools each role gets.
            </li>
            <li>
              <a href={`${admin}/collections/payload-mcp-api-keys`}>API keys</a> — for scripts, and
              for choosing tools key by key.
            </li>
          </ul>
        </section>
      )}
    </Page>
  )
}

export async function McpAuthorizeView(props: AdminViewServerProps) {
  const { payload, searchParams } = props
  const runtime = mcpOAuthRuntime(payload.config)
  const admin = payload.config.routes.admin
  const sealed = typeof searchParams?.['request'] === 'string' ? searchParams['request'] : undefined
  const here = `${admin}${runtime.connectPath}/authorize${sealed ? `?request=${encodeURIComponent(sealed)}` : ''}`
  const user = signedInOrLogin(props, here)

  const request = unseal<PendingRequest>(keys(payload).request, sealed)
  if (!request) {
    return (
      <Page props={props}>
        <h1>This sign-in link has expired</h1>
        <p>Go back to the app and connect again.</p>
      </Page>
    )
  }

  const policy = await readPolicy(payload, runtime)
  const client = await resolveClient(payload, policy, request.clientId)
  if ('error' in client) {
    return (
      <Page props={props}>
        <h1>This app can’t connect</h1>
        <p>{client.error}</p>
      </Page>
    )
  }

  const label = MCP_CLIENT_RULES[client.kind].label
  const verdict = runtime.eligible(user)
  const served = new Map(
    runtime.tools.map((tool) => [tool.name, (tool as { description?: string }).description ?? '']),
  )
  const tools = toolsFor(user, policy, runtime)
  const name = String(user['name'] ?? user['email'] ?? 'you')
  const host = new URL(request.redirectUri).host

  return (
    <Page props={props}>
      <h1>
        Connect {label} to {runtime.serverName}?
      </h1>
      {verdict !== true ? (
        <p className="tl-mcp__notice">{verdict}</p>
      ) : (
        <>
          <p className="tl-mcp__lede">
            {label} will work as <strong>{name}</strong>. It can do what you can do in{' '}
            {runtime.serverName}, through the tools below, and everything it does is recorded under
            your name. Publishing still follows your role and any approval a page needs.
          </p>
          {isLoopback(request.redirectUri) && (
            <p className="tl-mcp__notice">
              This connection signs in through an app on your own computer. Only allow it if you
              have just started connecting from Claude Code, or another app you trust.
            </p>
          )}
          <ul className="tl-mcp__tools">
            {tools.map((tool) => (
              <li key={tool}>
                <code>{tool}</code> {firstSentence(served.get(tool) ?? '')}
              </li>
            ))}
          </ul>
          <p className="tl-mcp__note">
            After you allow it, you go back to <strong>{host}</strong>. You can disconnect it at any
            time from <a href={`${admin}${runtime.connectPath}`}>Connect MCP</a>.
          </p>
        </>
      )}
      <ConsentActions request={sealed as string} allow={verdict === true} clientLabel={label} />
    </Page>
  )
}
