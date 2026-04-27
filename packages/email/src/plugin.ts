import type { CorePlugin } from '@forumone/throughline-plugin-contract'
import { getPluginRegistry } from '@forumone/throughline-plugin-contract'
import { createNamedLogger, defaultLogger } from '@forumone/throughline-core'
import type { InngestFunction } from 'inngest'
import { type EmailPluginOptions, validateOptions } from './options.js'
import { mergeTokens } from './tokens.js'
import { createEmailClient, type EmailClient } from './client.js'
import {
  createNotifyApprovalDecisionFunction,
  createNotifyApprovalExpiredFunction,
  createNotifyApprovalRequestFunction,
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

        const deps = { inngest: options.inngest, payload, client, tokens, options }
        const functions: InngestFunction.Any[] = [
          createNotifyApprovalRequestFunction(deps),
          createNotifyApprovalDecisionFunction(deps),
          createNotifyApprovalExpiredFunction(deps),
        ]

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
