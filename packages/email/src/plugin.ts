import type { CorePlugin } from '@forumone/throughline-plugin-contract'
import { getPluginRegistry } from '@forumone/throughline-plugin-contract'
import { createNamedLogger, defaultLogger } from '@forumone/throughline-core'
import type { InngestFunction } from 'inngest'
import type { Job, JobContext } from '@forumone/throughline-workflows'
import { type EmailPluginOptions, validateOptions } from './options.js'
import { mergeTokens } from './tokens.js'
import { createEmailClient, type EmailClient } from './client.js'
import {
  createNotifyApprovalDecisionFunction,
  createNotifyApprovalExpiredFunction,
  createNotifyApprovalRequestFunction,
  notifyApprovalDecisionJob,
  notifyApprovalExpiredJob,
  notifyApprovalRequestJob,
} from './functions/index.js'

const PLUGIN_ID = '@forumone/throughline-email'
const PLUGIN_VERSION = '0.1.0'

const EMAIL_CLIENT_SYMBOL = Symbol.for('@forumone/throughline/email-client')
const EMAIL_FUNCTIONS_SYMBOL = Symbol.for('@forumone/throughline/email-functions')

/**
 * Email plugin. Validates configuration, instantiates the Resend-backed
 * email client, and exposes the three notification Inngest functions
 * (request / decision / expired) via Symbols so the client app's
 * Inngest endpoint can register them alongside its other functions.
 *
 * Like the integrations plugin, this does not _serve_ Inngest — Payload
 * plugins don't have a hook for the Next.js Inngest route. Use
 * `getEmailFunctions(payload)` from your endpoint to compose them.
 */
export const emailPlugin: CorePlugin<EmailPluginOptions> =
  (rawOptions) => (incomingConfig) => {
    if (rawOptions.enabled === false) return incomingConfig

    const { options, env, brandName } = validateOptions(rawOptions)
    const logger = createNamedLogger('email', options.logger ?? defaultLogger)
    const tokens = mergeTokens({ ...options.tokens, brandName })

    return {
      ...incomingConfig,
      onInit: async (payload) => {
        if (incomingConfig.onInit) await incomingConfig.onInit(payload)

        const registry = getPluginRegistry(payload)

        const client = createEmailClient({
          apiKey: env.apiKey,
          fromAddress: env.fromAddress,
          fromName: env.fromName,
          ...(env.replyTo ? { defaultReplyTo: env.replyTo } : {}),
        })

        Object.defineProperty(payload, EMAIL_CLIENT_SYMBOL, {
          value: client,
          enumerable: false,
          writable: false,
          configurable: false,
        })

        // With no Inngest client, the site runs these as jobs (`emailJobs`),
        // and there is nothing to register here.
        const inngest = options.inngest
        const functions: InngestFunction.Any[] = inngest
          ? [
              createNotifyApprovalRequestFunction({ inngest, payload, client, tokens, options }),
              createNotifyApprovalDecisionFunction({ inngest, payload, client, tokens, options }),
              createNotifyApprovalExpiredFunction({ inngest, payload, client, tokens, options }),
            ]
          : []

        Object.defineProperty(payload, EMAIL_FUNCTIONS_SYMBOL, {
          value: functions,
          enumerable: false,
          writable: false,
          configurable: false,
        })

        registry.register({
          id: PLUGIN_ID,
          version: PLUGIN_VERSION,
          capabilities: ['email', 'notification-transport'],
        })

        logger.info('Email system ready', {
          brandName: tokens.brandName,
          from: env.fromAddress,
          functions: functions.length,
        })
      },
    }
  }

/**
 * The three notifications as runner-neutral jobs, for a site whose jobs adapter
 * takes its jobs while the config is being built (`payloadJobs().plugin(...)`).
 *
 * Pass the same options as `emailPlugin`, and register `emailPlugin` too: it
 * creates the email client these jobs send through. Each job finds Payload on
 * its context at run time, and the client on Payload.
 */
export function emailJobs(rawOptions: EmailPluginOptions): Job[] {
  const { options, brandName } = validateOptions(rawOptions)
  const tokens = mergeTokens({ ...options.tokens, brandName })

  const resolve = (context: JobContext) => {
    const payload = context.payload
    if (!payload) {
      throw new Error(
        'emailJobs: this runner gave the job no Payload instance. Use payloadJobs, or pass `payload` to inngestJobs.',
      )
    }
    const client = getEmailClient(payload)
    if (!client) {
      throw new Error('emailJobs: no email client on Payload. Register emailPlugin as well.')
    }
    return { payload, client, tokens, options }
  }

  return [
    notifyApprovalRequestJob(resolve),
    notifyApprovalDecisionJob(resolve),
    notifyApprovalExpiredJob(resolve),
  ]
}

export function getEmailClient(payload: unknown): EmailClient | undefined {
  return (payload as Record<symbol, unknown>)[EMAIL_CLIENT_SYMBOL] as EmailClient | undefined
}

export function getEmailFunctions(payload: unknown): InngestFunction.Any[] {
  return (
    ((payload as Record<symbol, unknown>)[EMAIL_FUNCTIONS_SYMBOL] as
      | InngestFunction.Any[]
      | undefined) ?? []
  )
}
