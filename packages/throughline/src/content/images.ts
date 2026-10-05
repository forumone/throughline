import type { Payload } from 'payload'

/*
Images an agent does not have yet. forumone-2026#845.

An image field takes a media document's id, and an agent drafting a page often
has none to give: the photo is on somebody's laptop, at a URL, or does not
exist yet. Until this it left the slot empty, which no longer publishes
(#840) and showed nothing in the preview. So wherever a draft takes an image it
also takes an instruction, and the write turns it into a media document before
saving:

- `{ importUrl, alt }` — a public image, fetched and saved to the library;
- `{ file: { base64, filename }, alt }` — a file the agent can read, which is
  Claude Code with a path on the person's machine. Claude on the web and in
  Desktop can see an image pasted into the chat but cannot pass its bytes on,
  which is why the upload link exists (see `uploadUrl` in `get`);
- `{ placeholder: { alt, label? } }` — a gray image that says PLACEHOLDER, for
  a slot nobody has an image for yet. It is flagged in the library, and a page
  that uses one does not publish until it is replaced (the publish pipeline's
  `placeholder-images` step).

The instruction is checked with the rest of the write's values, so a malformed
one refuses the write before anything is uploaded. The upload itself runs as
the person, so it is subject to the media collection's own access and its own
upload limits.
*/

export interface ImageRequest {
  /** The object the value sits in, which is rewritten to the new media id. */
  holder: Record<string, unknown>
  name: string
  path: string
  /** The upload field's collection. */
  collection: string
  directive: ImageDirective
}

export type ImageDirective =
  | { importUrl: string; alt: string }
  | { file: { base64: string; filename: string }; alt: string }
  | { placeholder: { alt: string; label?: string } }

const MAX_BYTES = 15 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Whether a value is one of the three instructions rather than an id. */
export function isImageDirective(value: unknown): boolean {
  return isObject(value) && ('importUrl' in value || 'file' in value || 'placeholder' in value)
}

/** What an image field takes, for a refusal and for `valueShapes`. */
export const IMAGE_SHAPE =
  'the media document\'s id, from find with kind "media". Without one: { importUrl: "https://…", alt } imports a public image; { file: { base64, filename }, alt } uploads a file you can read; { placeholder: { alt, label } } makes an obvious placeholder, which must be replaced before the page can publish. To have the person upload one, give them `uploadUrl` from get and ask for the address of the saved image: its id is the last part.'

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== ''

/** The problem with an instruction, or `undefined` when it is well formed. */
export function imageDirectiveProblem(
  value: Record<string, unknown>,
  path: string,
): string | undefined {
  const keys = ['importUrl', 'file', 'placeholder'].filter((key) => key in value)
  if (keys.length !== 1)
    return `${path} takes one of importUrl, file or placeholder, not ${keys.join(' and ')}.`

  if ('placeholder' in value) {
    const placeholder = value['placeholder']
    if (!isObject(placeholder) || !nonEmpty(placeholder['alt'])) {
      return `${path}.placeholder takes { alt, label? }: alt says what the real image will show.`
    }
    return undefined
  }
  if (!nonEmpty(value['alt'])) {
    return `${path} needs alt: what the image shows, for a reader who cannot see it.`
  }
  if ('importUrl' in value) {
    const url = value['importUrl']
    if (!nonEmpty(url) || !isPublicHttpsUrl(url)) {
      return `${path}.importUrl must be a public https:// address of the image itself.`
    }
    return undefined
  }
  const file = value['file']
  if (!isObject(file) || !nonEmpty(file['base64']) || !nonEmpty(file['filename'])) {
    return `${path}.file takes { base64, filename }.`
  }
  return undefined
}

/** HTTPS on the default port, a host name rather than an address on this network. */
export function isPublicHttpsUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false
  const host = url.hostname
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal'))
    return false
  if (/^\d+(\.\d+){3}$/.test(host) || host.startsWith('[')) return false
  return host.includes('.')
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

interface UploadFile {
  data: Buffer
  mimetype: string
  name: string
  size: number
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
}

function sniffType(data: Buffer, filename: string): string | undefined {
  if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg'
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  if (data.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif'
  const extension = filename.toLowerCase().split('.').pop()
  return Object.entries(EXTENSIONS).find(([, ext]) => ext === extension)?.[0]
}

function baseName(source: string): string {
  const last = source.split(/[\\/]/).pop() ?? 'image'
  const clean = last
    .split('?')[0]!
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return clean || 'image'
}

async function fetchImage(
  url: string,
  fetchImpl: FetchLike,
): Promise<UploadFile | { error: string }> {
  let response: Response
  try {
    response = await fetchImpl(url, {
      redirect: 'follow',
      headers: { accept: 'image/*' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    return { error: `${url} could not be fetched.` }
  }
  if (!response.ok) return { error: `${url} answered ${response.status}.` }
  if (response.url && !isPublicHttpsUrl(response.url)) {
    return { error: `${url} redirected somewhere this server will not fetch from.` }
  }
  const declared = Number(response.headers.get('content-length') ?? '0')
  if (declared > MAX_BYTES) return { error: `${url} is larger than 15 MB.` }
  const data = Buffer.from(await response.arrayBuffer())
  if (data.length > MAX_BYTES) return { error: `${url} is larger than 15 MB.` }
  const name = baseName(new URL(url).pathname)
  const mimetype = sniffType(data, name)
  if (!mimetype)
    return { error: `${url} is not an image this site takes (JPEG, PNG, WebP, GIF or AVIF).` }
  const extension = EXTENSIONS[mimetype]!
  return {
    data,
    mimetype,
    name: name.toLowerCase().endsWith(`.${extension}`) ? name : `${name}.${extension}`,
    size: data.length,
  }
}

function decodeFile(file: { base64: string; filename: string }): UploadFile | { error: string } {
  const data = Buffer.from(file.base64.replace(/^data:[^,]*,/, ''), 'base64')
  if (data.length === 0) return { error: `${file.filename} is empty, or not base64.` }
  if (data.length > MAX_BYTES) return { error: `${file.filename} is larger than 15 MB.` }
  const name = baseName(file.filename)
  const mimetype = sniffType(data, name)
  if (!mimetype)
    return {
      error: `${file.filename} is not an image this site takes (JPEG, PNG, WebP, GIF or AVIF).`,
    }
  return { data, mimetype, name, size: data.length }
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

/**
 * The placeholder's picture: unmistakably not a real image at any size. Gray,
 * hatched, the word PLACEHOLDER and what the real image is meant to show.
 */
export function placeholderSvg(label: string, width = 1600, height = 900): string {
  const short = label.length > 70 ? `${label.slice(0, 67)}…` : label
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs><pattern id="h" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="40" height="40" fill="#d9d9d9"/><rect width="20" height="40" fill="#cfcfcf"/></pattern></defs>
<rect width="100%" height="100%" fill="url(#h)"/>
<rect x="${width * 0.1}" y="${height * 0.32}" width="${width * 0.8}" height="${height * 0.36}" fill="#ffffff" stroke="#333333" stroke-width="6" stroke-dasharray="24 16"/>
<text x="50%" y="${height * 0.48}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(height * 0.09)}" font-weight="700" fill="#222222">PLACEHOLDER</text>
<text x="50%" y="${height * 0.6}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(height * 0.04)}" fill="#444444">${escapeXml(short)}</text>
</svg>`
}

type Sharp = (input: Buffer) => { png: () => { toBuffer: () => Promise<Buffer> } }

async function placeholderFile(
  payload: Payload,
  label: string,
): Promise<UploadFile | { error: string }> {
  const sharp = (payload.config as { sharp?: unknown }).sharp as Sharp | undefined
  if (typeof sharp !== 'function') {
    return {
      error:
        'This site cannot make placeholder images: Payload has no image processor (sharp) configured.',
    }
  }
  const data = await sharp(Buffer.from(placeholderSvg(label)))
    .png()
    .toBuffer()
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'image'
  return { data, mimetype: 'image/png', name: `placeholder-${slug}.png`, size: data.length }
}

export interface MaterializeOptions {
  /** The person the write runs as; the upload is theirs, under the media collection's access. */
  user: Record<string, unknown> | undefined
  /** The field that marks a placeholder, on the collections it is configured for. */
  placeholders?: { collection: string; field: string } | undefined
  fetch?: FetchLike
}

export interface CreatedImage {
  path: string
  id: number | string
  kind: 'import' | 'file' | 'placeholder'
}

/**
 * Turns each instruction into a media document and puts its id where the
 * instruction was. Stops at the first that fails; the images already made stay
 * in the library, named in the refusal so the agent can use them.
 */
export async function materializeImages(
  payload: Payload,
  requests: readonly ImageRequest[],
  options: MaterializeOptions,
): Promise<{ created: CreatedImage[] } | { error: string; created: CreatedImage[] }> {
  const created: CreatedImage[] = []
  for (const request of requests) {
    const directive = request.directive as Record<string, unknown>
    let file: UploadFile | { error: string }
    let alt: string
    let kind: CreatedImage['kind']
    let placeholder = false

    if ('placeholder' in directive) {
      const spec = directive['placeholder'] as { alt: string; label?: string }
      if (options.placeholders?.collection !== request.collection) {
        return {
          error: `${request.path}: this site has not set up placeholder images for ${request.collection}.`,
          created,
        }
      }
      alt = `Placeholder: ${spec.alt}`
      file = await placeholderFile(payload, spec.label ?? spec.alt)
      kind = 'placeholder'
      placeholder = true
    } else if ('importUrl' in directive) {
      alt = String(directive['alt'])
      file = await fetchImage(String(directive['importUrl']), options.fetch ?? fetch)
      kind = 'import'
    } else {
      alt = String(directive['alt'])
      file = decodeFile(directive['file'] as { base64: string; filename: string })
      kind = 'file'
    }
    if ('error' in file)
      return { error: `${request.path}: ${file.error} Nothing was saved.`, created }

    try {
      const doc = await payload.create({
        collection: request.collection as never,
        data: {
          alt,
          ...(placeholder && options.placeholders ? { [options.placeholders.field]: true } : {}),
        } as never,
        file,
        ...(options.user ? { user: options.user as never, overrideAccess: false } : {}),
      })
      const id = (doc as { id: number | string }).id
      request.holder[request.name] = id
      created.push({ path: request.path, id, kind })
    } catch (error) {
      return {
        error: `${request.path}: the image could not be saved to the library: ${(error as Error).message} Nothing was saved.`,
        created,
      }
    }
  }
  return { created }
}
