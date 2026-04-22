import { z } from 'zod'
import { CONTRACT_VERSION, ComponentContractSchema } from './schema.js'

const TokenDefinitionSchema = z.object({
  name: z.string(),
  value: z.string(),
  category: z.string(),
})

export type TokenDefinition = z.infer<typeof TokenDefinitionSchema>

export const ManifestSchema = z.object({
  /** The contract schema version this manifest satisfies. */
  contractVersion: z.literal(CONTRACT_VERSION),

  /** Metadata about the design system. */
  designSystem: z.object({
    name: z.string(),
    version: z.string(),
    description: z.string().optional(),
    homepage: z.string().url().optional(),
    storybookUrl: z.string().url().optional(),
  }),

  /** All tokens the design system exposes. Components reference them by name. */
  tokens: z.array(TokenDefinitionSchema),

  /** Components keyed by name. */
  components: z.record(z.string(), ComponentContractSchema),

  /** Build metadata. */
  build: z.object({
    timestamp: z.string().datetime(),
    source: z.string().optional(),
  }),
})

export type Manifest = z.infer<typeof ManifestSchema>
