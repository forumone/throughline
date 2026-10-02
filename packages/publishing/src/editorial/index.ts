export { editorialPlugin, CONTENT_HEALTH_VIEW_PATH } from './plugin.js'
export type { EditorialPluginOptions } from './plugin.js'

export {
  listHref,
  missingAltCheck,
  missingSeoCheck,
  monthsBefore,
  staleCheck,
  whereQuery,
} from './health/checks.js'
export type {
  HealthCheck,
  HealthRow,
  MissingAltCheckOptions,
  MissingSeoCheckOptions,
  StaleCheckOptions,
} from './health/checks.js'

export { findContentNeedingAttention } from './health/find.js'
export type {
  FindContentNeedingAttentionOptions,
  HealthCheckResult,
  HealthGroup,
  HealthReport,
} from './health/find.js'

export {
  HEALTH_TOOLS,
  HEALTH_TOOL_DESCRIPTORS,
  createFindContentNeedingAttentionTool,
  toolReport,
} from './health/tool.js'
export type { HealthToolDeps } from './health/tool.js'

export { relativeTime } from './relativeTime.js'
