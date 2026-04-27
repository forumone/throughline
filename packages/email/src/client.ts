import type { ReactElement } from 'react'

export interface EmailClient {
  send(params: SendEmailParams): Promise<SendEmailResult>
}

export interface SendEmailParams {
  to: string | string[]
  subject: string
  template: ReactElement
  tags?: Array<{ name: string; value: string }>
  replyTo?: string
}

export interface SendEmailResult {
  id: string
  deliveredAt: string
}

export interface EmailClientOptions {
  apiKey: string
  fromAddress: string
  fromName: string
  defaultReplyTo?: string
  /**
   * Optional Resend constructor override for tests or self-hosted Resend
   * deployments. The default loads `resend` lazily so the package is
   * still importable in environments without Resend installed (e.g. tests
   * that mock the client entirely).
   */
  resendClient?: { emails: { send: (input: ResendSendInput) => Promise<ResendSendResult> } }
  /**
   * Optional renderer override. The default lazily imports
   * `@react-email/render` and produces both HTML and plaintext.
   */
  render?: TemplateRenderer
}

export interface TemplateRenderer {
  toHtml: (template: ReactElement) => Promise<string>
  toText: (template: ReactElement) => Promise<string>
}

interface ResendSendInput {
  from: string
  to: string[]
  subject: string
  html: string
  text: string
  tags?: Array<{ name: string; value: string }>
  replyTo?: string
}

interface ResendSendResult {
  data: { id: string } | null
  error: { message: string; name?: string } | null
}

interface ResendCtor {
  new (apiKey: string): {
    emails: { send: (input: ResendSendInput) => Promise<ResendSendResult> }
  }
}

/**
 * Wraps Resend with React Email rendering and a stable result envelope.
 * Each `send` call produces both HTML and plaintext from the same React
 * tree — plaintext is non-optional for accessibility (screen readers),
 * deliverability (spam scores), and clients that refuse HTML.
 *
 * Construction is lazy: the Resend SDK and the renderer are only loaded
 * when `send()` is first called. That keeps tests that mock the client
 * fully runnable in environments where neither package is installed.
 */
export function createEmailClient(options: EmailClientOptions): EmailClient {
  const from = `${options.fromName} <${options.fromAddress}>`

  let cachedResend: EmailClientOptions['resendClient'] | undefined = options.resendClient
  let cachedRenderer: TemplateRenderer | undefined = options.render

  async function getResend() {
    if (cachedResend) return cachedResend
    const mod = (await import('resend')) as { Resend: ResendCtor }
    cachedResend = new mod.Resend(options.apiKey)
    return cachedResend
  }

  async function getRenderer(): Promise<TemplateRenderer> {
    if (cachedRenderer) return cachedRenderer
    const mod = (await import('@react-email/render')) as {
      render: (template: ReactElement, opts?: { plainText?: boolean }) => Promise<string>
    }
    cachedRenderer = {
      toHtml: (template) => mod.render(template),
      toText: (template) => mod.render(template, { plainText: true }),
    }
    return cachedRenderer
  }

  return {
    async send(params) {
      const renderer = await getRenderer()
      const [html, text] = await Promise.all([
        renderer.toHtml(params.template),
        renderer.toText(params.template),
      ])

      const resend = await getResend()
      const input: ResendSendInput = {
        from,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html,
        text,
      }
      if (params.tags) input.tags = params.tags
      const replyTo = params.replyTo ?? options.defaultReplyTo
      if (replyTo) input.replyTo = replyTo

      const result = await resend!.emails.send(input)
      if (result.error) {
        throw new Error(`Email send failed: ${result.error.message}`)
      }
      return {
        id: result.data?.id ?? 'unknown',
        deliveredAt: new Date().toISOString(),
      }
    },
  }
}
