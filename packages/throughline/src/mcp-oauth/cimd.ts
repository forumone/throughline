/*
A client ID metadata document (CIMD): a client whose `client_id` is an HTTPS URL
serving its own registration. Claude and ChatGPT both prefer it to registering,
and it is the better arrangement for this server too — nothing is written for a
client until somebody consents, and there is no open endpoint to fill a table.
draft-ietf-oauth-client-id-metadata-document.

Fetching a URL a stranger supplies is the risk, so the fetch is narrow: HTTPS on
the default port, a host name rather than an IP literal, no redirects followed,
five seconds, and 64 KB. What the document says is then held to the same
allowlist as a registration — its redirects must all match one enabled rule —
so a document can only ever describe an app this site already accepts.
*/

export interface ClientMetadataDocument {
  client_id: string
  client_name?: string
  redirect_uris: string[]
}

const MAX_BYTES = 64 * 1024
const TIMEOUT_MS = 5_000

/** Whether `clientId` is the kind of URL this server will fetch. */
export function isMetadataDocumentUrl(clientId: string): boolean {
  let url: URL
  try {
    url = new URL(clientId)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password || url.hash) {
    return false
  }
  const host = url.hostname
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal'))
    return false
  if (/^\d+(\.\d+){3}$/.test(host) || host.startsWith('[')) return false
  if (!host.includes('.')) return false
  return url.pathname !== '/'
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

/** The document at `clientId`, or why it could not be used. */
export async function fetchClientMetadata(
  clientId: string,
  fetchImpl: FetchLike = fetch,
): Promise<ClientMetadataDocument | { error: string }> {
  if (!isMetadataDocumentUrl(clientId))
    return { error: 'client_id is not a URL this server fetches.' }

  let response: Response
  try {
    response = await fetchImpl(clientId, {
      redirect: 'manual',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    return { error: 'The client metadata document could not be fetched.' }
  }
  if (response.status !== 200) {
    return { error: `The client metadata document answered ${response.status}.` }
  }

  const declared = Number(response.headers.get('content-length') ?? '0')
  if (declared > MAX_BYTES) return { error: 'The client metadata document is too large.' }
  const text = await response.text()
  if (text.length > MAX_BYTES) return { error: 'The client metadata document is too large.' }

  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch {
    return { error: 'The client metadata document is not JSON.' }
  }
  if (!doc || typeof doc !== 'object')
    return { error: 'The client metadata document is not an object.' }
  const record = doc as Record<string, unknown>
  if (record['client_id'] !== clientId) {
    return { error: 'The client metadata document names a different client_id.' }
  }
  const redirects = record['redirect_uris']
  if (!Array.isArray(redirects) || !redirects.every((each) => typeof each === 'string')) {
    return { error: 'The client metadata document has no redirect_uris.' }
  }
  const method = record['token_endpoint_auth_method']
  if (method !== undefined && method !== 'none') {
    const supported = record['token_endpoint_auth_methods_supported']
    if (!(Array.isArray(supported) && supported.includes('none'))) {
      return {
        error: 'This server accepts public clients only (token_endpoint_auth_method "none").',
      }
    }
  }
  return {
    client_id: clientId,
    redirect_uris: redirects as string[],
    ...(typeof record['client_name'] === 'string' ? { client_name: record['client_name'] } : {}),
  }
}
