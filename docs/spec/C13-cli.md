# Phase C13 — CLI Scaffolder

## Goal

Build `create-claude-cms` — the CLI that scaffolds a new client project. Running `pnpm create @forumone/claude-cms my-client-site` produces a ready-to-run monorepo with all core packages wired, env vars stubbed, an example collection and design system reference, and a first deployment checklist. After C13, a developer can go from zero to "Claude editing content" in under an hour.

## Prerequisites

- C0 through C12 complete; all core packages are published to npm (as beta versions if not yet stable)
- The core monorepo's `packages/` contains the reference design system, design contract, core plumbing, and all five server plugins

## Context

The CLI is what turns the core framework from "a collection of npm packages" into "a product that's easy to adopt." Without a good scaffolder, every new client project starts with a week of boilerplate assembly — wiring Payload, configuring plugins, setting up Inngest, creating the Next.js monorepo structure, copying env var templates. With the scaffolder, those decisions are already made and the developer gets a working system on day one.

The CLI is interactive but opinionated. It asks a small set of questions to understand the project shape, then generates files from templates. It does not try to be a framework-in-itself or cover every possible customization — clients diverge from the scaffold on day two. The scaffolder's job is to produce a sensible starting point, not a final product.

Key design decisions:

- **Interactive prompts, not config files.** The developer runs the CLI and answers questions. No YAML config, no elaborate CLI flags. The resulting file is the source of truth going forward.
- **Template-based generation.** The scaffolder ships with a complete example monorepo and copies/modifies it based on prompt answers. Maintaining the templates is straightforward because they're real working code.
- **Sensible defaults, minimal questions.** Every question the CLI asks costs cognitive load. Ask only what actually changes the output; default the rest.
- **Post-install instructions.** After generating files, the CLI prints clear next steps — what env vars to set, what to deploy, what to read. A developer closing the terminal without doing anything else should still understand what they have.

## Tasks

### C13.1 — Scaffold the package

```
packages/create-claude-cms/
├── src/
│   ├── bin.ts                   # Entry point
│   ├── prompts.ts               # Interactive prompts
│   ├── generator.ts             # File generation logic
│   ├── templates/               # Template files bundled into the package
│   │   ├── base/                # Common files every project gets
│   │   ├── with-reference-ds/   # Optional: reference DS as workspace
│   │   └── without-reference-ds/ # When client brings their own DS
│   ├── post-install.ts          # Next-steps printer
│   └── utils/
│       ├── fs.ts
│       ├── templates.ts
│       └── env.ts
├── package.json
├── tsconfig.json
├── README.md
└── CHANGELOG.md
```

`package.json`:

```json
{
  "name": "create-claude-cms",
  "version": "0.1.0",
  "description": "Scaffolder for new Claude-First CMS client projects.",
  "type": "module",
  "bin": {
    "create-claude-cms": "./dist/bin.js"
  },
  "files": ["dist", "templates", "README.md", "CHANGELOG.md"],
  "scripts": {
    "build": "tsc -b && pnpm copy-templates",
    "copy-templates": "cp -r src/templates dist/templates",
    "dev": "tsc -b -w",
    "clean": "rm -rf dist .turbo",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "dependencies": {
    "@clack/prompts": "^0.8.0",
    "picocolors": "^1.1.0"
  },
  "devDependencies": {
    "@forumone/claude-cms-tsconfig": "workspace:*",
    "@forumone/claude-cms-eslint-config": "workspace:*",
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "engines": {
    "node": ">=20.9.0"
  }
}
```

Note: the package name is unscoped (`create-claude-cms`, not `@forumone/create-claude-cms`). This is the convention for `pnpm create` and `npm init` — they work with unscoped `create-*` packages or scoped `@scope/create-*` packages. We'll use the scoped form.

Correction: change name to `@forumone/create-claude-cms` and update the bin accordingly. Users run `pnpm create @forumone/claude-cms my-client-site`.

### C13.2 — Build the entry point

`src/bin.ts`:

```typescript
#!/usr/bin/env node

import { intro, outro, cancel, isCancel } from '@clack/prompts'
import pc from 'picocolors'
import { gatherAnswers } from './prompts'
import { generate } from './generator'
import { printNextSteps } from './post-install'

async function main() {
  console.log()
  intro(pc.bgMagenta(pc.white(' Claude-First CMS ')) + ' ' + pc.dim('v0.1.0'))

  const targetDir = process.argv[2]
  if (!targetDir) {
    cancel('Please provide a project name: pnpm create @forumone/claude-cms my-project')
    process.exit(1)
  }

  const answers = await gatherAnswers({ targetDir })
  if (isCancel(answers)) {
    cancel('Cancelled.')
    process.exit(0)
  }

  await generate(answers)

  printNextSteps(answers)

  outro(pc.green('Ready.'))
}

main().catch((error) => {
  console.error(pc.red('Unexpected error:'), error)
  process.exit(1)
})
```

### C13.3 — Build the interactive prompts

`src/prompts.ts`:

```typescript
import { text, select, confirm, group, cancel } from '@clack/prompts'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface Answers {
  targetDir: string
  projectName: string
  packageScope: string
  useReferenceDs: boolean
  initializeGit: boolean
  installDeps: boolean
  deploymentPlatform: 'vercel' | 'railway' | 'fly' | 'other'
  databasePlatform: 'neon' | 'supabase' | 'self-hosted-postgres'
}

export async function gatherAnswers({ targetDir }: { targetDir: string }): Promise<Answers> {
  const absoluteTarget = resolve(process.cwd(), targetDir)

  if (existsSync(absoluteTarget)) {
    cancel(`Directory "${targetDir}" already exists. Choose a different name or remove it.`)
    process.exit(1)
  }

  const defaultProjectName = targetDir.split('/').pop() ?? 'claude-cms-project'

  const answers = await group(
    {
      projectName: () =>
        text({
          message: 'Project name (used in package.json):',
          initialValue: defaultProjectName,
          validate: (value) => {
            if (!/^[a-z0-9-]+$/.test(value)) return 'Use lowercase letters, numbers, and hyphens only'
          },
        }),
      packageScope: () =>
        text({
          message: 'npm scope for internal packages (without @, press enter to skip):',
          initialValue: '',
        }),
      useReferenceDs: () =>
        confirm({
          message: 'Use the reference design system as a starting point?',
          initialValue: true,
        }),
      deploymentPlatform: () =>
        select({
          message: 'Where will this deploy?',
          options: [
            { value: 'vercel', label: 'Vercel', hint: 'Recommended for Phase 1' },
            { value: 'railway', label: 'Railway', hint: 'Long-running container; no cold starts' },
            { value: 'fly', label: 'Fly.io', hint: 'Long-running container' },
            { value: 'other', label: 'Other / decide later' },
          ],
        }),
      databasePlatform: () =>
        select({
          message: 'Postgres provider?',
          options: [
            { value: 'neon', label: 'Neon', hint: 'Recommended; branch-per-preview' },
            { value: 'supabase', label: 'Supabase' },
            { value: 'self-hosted-postgres', label: 'Self-hosted Postgres' },
          ],
        }),
      initializeGit: () =>
        confirm({
          message: 'Initialize a git repository?',
          initialValue: true,
        }),
      installDeps: () =>
        confirm({
          message: 'Install dependencies now?',
          initialValue: true,
        }),
    },
    {
      onCancel: () => {
        cancel('Cancelled.')
        process.exit(0)
      },
    },
  )

  return {
    targetDir: absoluteTarget,
    ...answers,
  } as Answers
}
```

### C13.4 — Build the generator

`src/generator.ts`:

```typescript
import { cp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { spinner } from '@clack/prompts'
import type { Answers } from './prompts'
import { renderTemplate } from './utils/templates'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = resolve(__dirname, 'templates')

export async function generate(answers: Answers): Promise<void> {
  const s = spinner()

  s.start('Creating project structure')
  await mkdir(answers.targetDir, { recursive: true })
  await copyBaseTemplate(answers)
  s.stop('Project structure ready')

  s.start('Writing configuration files')
  await writeConfig(answers)
  s.stop('Configuration written')

  if (answers.useReferenceDs) {
    s.start('Wiring reference design system')
    await wireReferenceDs(answers)
    s.stop('Design system wired')
  } else {
    s.start('Preparing design system placeholder')
    await writeDesignSystemPlaceholder(answers)
    s.stop('Design system placeholder ready')
  }

  if (answers.initializeGit) {
    s.start('Initializing git')
    await initGit(answers.targetDir)
    s.stop('Git repo initialized')
  }

  if (answers.installDeps) {
    s.start('Installing dependencies (this may take a minute)')
    await installDependencies(answers.targetDir)
    s.stop('Dependencies installed')
  }
}

async function copyBaseTemplate(answers: Answers): Promise<void> {
  const source = resolve(TEMPLATES_DIR, 'base')
  await cp(source, answers.targetDir, { recursive: true })

  // Template the top-level files (package.json, README.md, etc.)
  const filesToTemplate = ['package.json', 'README.md', 'pnpm-workspace.yaml', 'turbo.json', '.env.example', 'apps/web/package.json']
  for (const relative of filesToTemplate) {
    const filePath = join(answers.targetDir, relative)
    const content = await readFile(filePath, 'utf-8')
    const rendered = renderTemplate(content, answers)
    await writeFile(filePath, rendered)
  }
}

async function writeConfig(answers: Answers): Promise<void> {
  // The main Payload config is generated dynamically based on answers
  const configPath = join(answers.targetDir, 'apps/web/src/payload.config.ts')
  const template = await readFile(join(TEMPLATES_DIR, 'base/apps/web/src/payload.config.ts.template'), 'utf-8')
  const rendered = renderTemplate(template, answers)
  await writeFile(configPath, rendered)

  // The Inngest handler needs conditional function registration
  const inngestPath = join(answers.targetDir, 'apps/web/src/app/api/inngest/route.ts')
  const inngestTemplate = await readFile(
    join(TEMPLATES_DIR, 'base/apps/web/src/app/api/inngest/route.ts.template'),
    'utf-8',
  )
  const inngestRendered = renderTemplate(inngestTemplate, answers)
  await writeFile(inngestPath, inngestRendered)
}

async function wireReferenceDs(answers: Answers): Promise<void> {
  // Add reference DS as a workspace dependency rather than duplicating.
  // The scaffold is a monorepo itself, so we set up a packages/design-system
  // directory that re-exports the reference DS with a brand layer.
  const template = await readFile(join(TEMPLATES_DIR, 'with-reference-ds/design-system-index.ts'), 'utf-8')
  await writeFile(
    join(answers.targetDir, 'packages/design-system/src/index.ts'),
    renderTemplate(template, answers),
  )
}

async function writeDesignSystemPlaceholder(answers: Answers): Promise<void> {
  const readme = await readFile(join(TEMPLATES_DIR, 'without-reference-ds/DESIGN-SYSTEM-README.md'), 'utf-8')
  await writeFile(join(answers.targetDir, 'packages/design-system/README.md'), renderTemplate(readme, answers))
}

async function initGit(dir: string): Promise<void> {
  await runCommand('git', ['init'], dir)
  await runCommand('git', ['add', '.'], dir)
  await runCommand('git', ['commit', '-m', 'Initial commit from create-claude-cms'], dir)
}

async function installDependencies(dir: string): Promise<void> {
  await runCommand('pnpm', ['install'], dir)
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' })
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`))
    })
    child.on('error', reject)
  })
}
```

### C13.5 — Build the template files

The templates are real, working files. Create them in `src/templates/`:

`src/templates/base/package.json`:

```json
{
  "name": "{{projectName}}",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.6.0",
    "prettier": "^3.4.0"
  },
  "packageManager": "pnpm@9.14.0",
  "engines": {
    "node": ">=20.9.0",
    "pnpm": ">=9.0.0"
  }
}
```

`src/templates/base/pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

`src/templates/base/.env.example`:

```
# --- Required ---
DATABASE_URI=postgres://user:pass@host/dbname
PAYLOAD_SECRET=generate-with-openssl-rand-base64-48
NEXT_PUBLIC_SERVER_URL=http://localhost:3000

# --- Inngest ---
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# --- Resend (for approval emails) ---
RESEND_API_KEY=
EMAIL_FROM_ADDRESS=notifications@example.com
EMAIL_FROM_NAME={{projectName}}
EMAIL_REPLY_TO=

# --- Approval tokens ---
# Generate: openssl rand -base64 48
APPROVAL_TOKEN_SECRET=

# --- Forms ---
# Generate: openssl rand -base64 48
FORMS_IP_HASH_SECRET=

# --- MCP server keys ---
# Each key is generated in the Payload admin after first deploy
# and pasted here for local dev
COMPONENT_SERVER_API_KEY=
PUBLISHING_SERVER_API_KEY=
APPROVALS_SERVER_API_KEY=
AUDIT_SERVER_API_KEY=
FORMS_SERVER_API_KEY=
INTEGRATIONS_SERVER_API_KEY=

# System API key for scheduled workflows
PUBLISHING_SYSTEM_API_KEY=

# --- Optional: embeddings for intent matching ---
# If blank, TF-IDF matching is used
VOYAGE_API_KEY=
```

`src/templates/base/apps/web/src/payload.config.ts.template`:

```typescript
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import { mcpPlugin } from '@payloadcms/plugin-mcp'

import { auditPlugin, createApiKeysCollection, createInngestClient } from '@forumone/claude-cms-core'
import { componentsPlugin } from '@forumone/claude-cms-components'
import { publishingPlugin } from '@forumone/claude-cms-publishing'
import { approvalsPlugin, getApprovalResolver } from '@forumone/claude-cms-approvals'
import { auditQueryPlugin } from '@forumone/claude-cms-audit'
import { integrationsPlugin } from '@forumone/claude-cms-integrations'
import { emailPlugin } from '@forumone/claude-cms-email'
import { formsPlugin } from '@forumone/claude-cms-forms'

{{#if useReferenceDs}}
import manifest from '@forumone/claude-cms-reference-ds/manifest'
{{/if}}

const inngest = createInngestClient({ id: '{{projectName}}' })

export default buildConfig({
  admin: { user: 'users' },
  db: postgresAdapter({ pool: { connectionString: process.env.DATABASE_URI } }),
  collections: [
    // Users collection — add your own fields as needed
    {
      slug: 'users',
      auth: true,
      admin: { useAsTitle: 'email' },
      fields: [
        { name: 'name', type: 'text' },
        { name: 'roles', type: 'select', hasMany: true, options: ['admin', 'editor', 'approver', 'form-admin'] },
        { name: 'groups', type: 'select', hasMany: true, options: ['editorial', 'legal', 'communications', 'senior'] },
      ],
    },
    // Example Pages collection — replace or extend with your content model
    {
      slug: 'pages',
      admin: { useAsTitle: 'title' },
      versions: { drafts: true },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'text', required: true, unique: true },
        { name: 'layout', type: 'blocks', blocks: [/* your blocks here */] },
        {
          name: 'seo',
          type: 'group',
          fields: [
            { name: 'title', type: 'text' },
            { name: 'description', type: 'textarea' },
          ],
        },
        {
          name: 'policy',
          type: 'group',
          fields: [
            { name: 'requiresApproval', type: 'checkbox' },
            { name: 'approverGroups', type: 'select', hasMany: true, options: ['editorial', 'legal', 'communications', 'senior'] },
            { name: 'embargoedUntil', type: 'date' },
          ],
        },
        { name: 'publishedAt', type: 'date' },
        { name: 'scheduledPublishAt', type: 'date' },
      ],
    },
    createApiKeysCollection(),
  ],
  plugins: [
    // Order matters: audit first, then component/publishing/approvals, then email, then forms/integrations.
    auditPlugin({ inngest }),
    mcpPlugin({
      collections: {
        pages: { operations: { find: true, create: true, update: true } },
      },
    }),
    componentsPlugin({
      {{#if useReferenceDs}}
      manifest: { type: 'object', manifest },
      {{else}}
      // TODO: point this at your design system's manifest
      manifest: { type: 'url', url: 'https://your-design-system.example.com/manifest.json' },
      {{/if}}
      matching: { strategy: 'tfidf' },
    }),
    approvalsPlugin({
      groups: [
        { slug: 'editorial', name: 'Editorial' },
        { slug: 'legal', name: 'Legal' },
        { slug: 'communications', name: 'Communications' },
        { slug: 'senior', name: 'Senior leadership' },
      ],
      groupResolver: {
        // This simple resolver looks up users by their groups field. Replace
        // with your client's actual user/group system (SSO, etc.) as needed.
        async resolveUsers(groupSlugs) {
          // Implementation depends on your users collection shape
          return []
        },
      },
      inngest,
    }),
    publishingPlugin({
      collections: [{ slug: 'pages' }],
      inngest,
      // Wire the approval resolver lazily
      approvalResolver: {
        getActiveApproval: async (collection, id, version) => {
          // Looked up via the getApprovalResolver helper at call time
          return null
        },
      },
    }),
    auditQueryPlugin(),
    emailPlugin({
      inngest,
      resolveApprover: async (userId) => {
        // Replace with your user lookup logic
        return null
      },
      resolveRequester: async (userId) => {
        // Replace with your user lookup logic
        return null
      },
      tokens: {
        brandName: '{{projectName}}',
      },
    }),
    formsPlugin({
      inngest,
      allowedDestinations: [
        // Replace with your client's allowed destinations
        // {
        //   type: 'email',
        //   value: 'team@example.com',
        //   label: 'Main inbox',
        //   description: 'General contact form destination',
        // },
      ],
    }),
    integrationsPlugin({ inngest }),
    vercelBlobStorage({
      collections: { media: true },
      token: process.env.BLOB_READ_WRITE_TOKEN,
    }),
  ],
  secret: process.env.PAYLOAD_SECRET!,
  typescript: {
    outputFile: './src/payload-types.ts',
  },
})
```

Note: the config has `TODO` markers where the client needs to fill in specifics (group resolver, approval resolver wiring, user lookups). This is deliberate — the scaffold gets the file into a compilable state with clear pointers to what must be customized before the system will actually work.

`src/templates/base/apps/web/src/app/api/inngest/route.ts.template`:

```typescript
import { serve } from 'inngest/next'
import { getPayload } from 'payload'
import config from '@/payload.config'
import {
  createRevalidateOnPublishFunction,
  createExecuteScheduledPublishesFunction,
  createExpireStaleApprovalsFunction,
  createAuditEventEchoFunction,
  createHealthcheckFunction,
  createPayloadReachableCheck,
} from '@forumone/claude-cms-workflows'
import { getEmailFunctions } from '@forumone/claude-cms-email'
import { getFormsFunctions } from '@forumone/claude-cms-forms'
import { getIntegrationRegistry, getIntegrationContext } from '@forumone/claude-cms-integrations'
import { createInngestClient } from '@forumone/claude-cms-core'

const inngest = createInngestClient({ id: '{{projectName}}' })
const payload = await getPayload({ config })

const emailFunctions = getEmailFunctions(payload)
const formsFunctions = getFormsFunctions(payload)
const integrationRegistry = getIntegrationRegistry(payload)
const integrationContext = getIntegrationContext(payload)
const integrationFunctions = integrationRegistry && integrationContext
  ? integrationRegistry.list().flatMap((i) => i.createFunctions(integrationContext))
  : []

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    createRevalidateOnPublishFunction({ inngest, payload }),
    createExecuteScheduledPublishesFunction({
      inngest,
      payload,
      collections: [{ slug: 'pages' }],
      publishingServerUrl: process.env.NEXT_PUBLIC_SERVER_URL!,
    }),
    createExpireStaleApprovalsFunction({ inngest, payload }),
    createAuditEventEchoFunction({ inngest }),
    createHealthcheckFunction({
      inngest,
      payload,
      checks: [createPayloadReachableCheck()],
    }),
    ...emailFunctions,
    ...formsFunctions,
    ...integrationFunctions,
  ],
})
```

`src/templates/base/apps/web/package.json`:

```json
{
  "name": "@{{packageScope}}/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbo",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "payload": "payload"
  },
  "dependencies": {
    "@forumone/claude-cms-core": "^0.1.0",
    "@forumone/claude-cms-components": "^0.1.0",
    "@forumone/claude-cms-publishing": "^0.1.0",
    "@forumone/claude-cms-approvals": "^0.1.0",
    "@forumone/claude-cms-audit": "^0.1.0",
    "@forumone/claude-cms-integrations": "^0.1.0",
    "@forumone/claude-cms-email": "^0.1.0",
    "@forumone/claude-cms-forms": "^0.1.0",
    "@forumone/claude-cms-workflows": "^0.1.0",
    {{#if useReferenceDs}}
    "@forumone/claude-cms-reference-ds": "^0.1.0",
    {{/if}}
    "@payloadcms/db-postgres": "^3.0.0",
    "@payloadcms/plugin-form-builder": "^3.0.0",
    "@payloadcms/plugin-mcp": "latest",
    "@payloadcms/storage-vercel-blob": "^3.0.0",
    "inngest": "^3.0.0",
    "next": "^15.0.0",
    "payload": "^3.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "typescript": "^5.6.0"
  }
}
```

Also ship: `apps/web/src/app/layout.tsx`, a minimal `apps/web/src/app/(frontend)/[...slug]/page.tsx`, a stub `apps/web/src/app/(payload)/` directory (Payload auto-generates this), a basic `apps/web/next.config.ts`, an `apps/web/tsconfig.json`, and a top-level `turbo.json`.

### C13.6 — Build the post-install printer

`src/post-install.ts`:

```typescript
import pc from 'picocolors'
import type { Answers } from './prompts'

export function printNextSteps(answers: Answers): void {
  console.log()
  console.log(pc.bold('Next steps:'))
  console.log()

  console.log(pc.cyan('  1.'), `${pc.bold('cd')} ${answers.targetDir.split('/').pop()}`)

  let step = 2
  if (!answers.installDeps) {
    console.log(pc.cyan(`  ${step}.`), `${pc.bold('pnpm install')}`)
    step++
  }

  console.log(pc.cyan(`  ${step}.`), `Copy ${pc.bold('.env.example')} to ${pc.bold('.env.local')} and fill in values`)
  step++

  if (answers.databasePlatform === 'neon') {
    console.log(pc.dim('       - Create a Neon project and use its connection string for DATABASE_URI'))
  }

  console.log(pc.cyan(`  ${step}.`), 'Generate required secrets:')
  console.log(pc.dim('       openssl rand -base64 48  # for PAYLOAD_SECRET'))
  console.log(pc.dim('       openssl rand -base64 48  # for APPROVAL_TOKEN_SECRET'))
  console.log(pc.dim('       openssl rand -base64 48  # for FORMS_IP_HASH_SECRET'))
  step++

  console.log(pc.cyan(`  ${step}.`), `${pc.bold('pnpm dev')} to run locally`)
  step++

  console.log(pc.cyan(`  ${step}.`), `Open http://localhost:3000/admin and create your first user`)
  step++

  console.log(pc.cyan(`  ${step}.`), `In the admin, go to MCP → API Keys and create keys for each MCP server`)
  step++

  console.log(pc.cyan(`  ${step}.`), 'Paste the generated keys into .env.local')
  step++

  console.log(pc.cyan(`  ${step}.`), 'Wire Claude to your MCP endpoints (see README.md)')

  console.log()
  console.log(pc.dim('Customizations you will likely need to make:'))
  console.log(pc.dim('  - Replace the example Pages collection with your content model'))
  console.log(pc.dim('  - Implement the groupResolver and user resolvers in payload.config.ts'))
  console.log(pc.dim('  - Add your destinations to the formsPlugin allowlist'))

  if (!answers.useReferenceDs) {
    console.log(pc.dim('  - Point componentsPlugin at your design system manifest URL'))
  }

  console.log()
  console.log(pc.dim('Documentation: https://docs.claude-cms.forumone.com'))
  console.log()
}
```

### C13.7 — Build the template helper

`src/utils/templates.ts`:

```typescript
/**
 * Minimal mustache-style template renderer. Supports {{variable}} and
 * {{#if variable}}...{{/if}} with no nesting. Keeps the CLI dependency-free.
 */
export function renderTemplate(template: string, data: Record<string, unknown>): string {
  // Handle {{#if variable}}...{{/if}} blocks
  let result = template.replace(
    /{{#if (\w+)}}([\s\S]*?){{\/if}}/g,
    (_, variable: string, content: string) => {
      return data[variable] ? content : ''
    },
  )

  // Handle {{variable}} substitutions
  result = result.replace(/{{(\w+)}}/g, (_, variable: string) => {
    return String(data[variable] ?? '')
  })

  return result
}
```

### C13.8 — Write tests

Test the generator against known-answer inputs. Use a temp directory for each test. Assert that:

- Answers with `useReferenceDs: true` produce a package.json with the reference DS dependency
- Answers with `useReferenceDs: false` produce a design system placeholder
- The Payload config compiles (run tsc against the generated file)
- The Inngest endpoint has all the expected function registrations
- Template substitution produces valid output for all prompted values

Use `vitest` with `beforeEach` creating a temp dir and `afterEach` cleaning up.

### C13.9 — Write the README

`README.md`:

```markdown
# create-claude-cms

Scaffolder for new Claude-First CMS client projects.

## Usage

```bash
pnpm create @forumone/claude-cms my-client-site
```

Or with npm:

```bash
npm create @forumone/claude-cms@latest my-client-site
```

The scaffolder asks a few questions, then generates a ready-to-run monorepo
with all core packages wired. You'll need to fill in environment variables,
implement client-specific resolvers (users, groups), and replace the example
content model with your own.

## What you get

```
my-client-site/
├── apps/
│   └── web/                 # Next.js + Payload with all plugins wired
├── packages/
│   ├── design-system/       # Your design system (or ref DS if chosen)
│   ├── content/             # Client-specific collections and blocks
│   ├── brand/               # Tokens, email templates, voice config
│   └── integrations/        # Client-specific integrations
├── .env.example
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

## After scaffolding

Read the README.md in your generated project for full setup instructions.
Expect to spend 1-2 hours from `pnpm create` to "Claude editing a real page"
for the first project; subsequent projects should be much faster as you
accumulate reusable patterns.
```

### C13.10 — Changeset

```bash
pnpm changeset
```

Select `@forumone/create-claude-cms`, choose `minor`:

> Initial release. Interactive CLI that scaffolds a new Claude-First CMS project. Generates a pnpm monorepo with all core packages wired, Inngest endpoint configured, environment variable template, reference design system integration (optional), and post-install instructions. Run: `pnpm create @forumone/claude-cms my-project`.

## Acceptance criteria

- [ ] `pnpm create @forumone/claude-cms <dir>` produces a working monorepo
- [ ] Generated project's `pnpm install` succeeds
- [ ] Generated project's `pnpm typecheck` succeeds (with TODO comments where customization is required)
- [ ] All interactive prompts work with validation
- [ ] `useReferenceDs: true` wires the reference DS; `false` produces a placeholder
- [ ] Post-install instructions accurately describe what the user needs to do next
- [ ] Template system handles `{{variable}}` and `{{#if variable}}` correctly
- [ ] Generated `.env.example` lists every required env var with helpful comments
- [ ] Payload config template imports all correct plugins in the correct order
- [ ] Inngest route template registers all framework functions
- [ ] CLI is published and pnpm's `create` protocol can invoke it
- [ ] Generated project's README guides the developer through first-time setup

## Notes for Claude Code

- The templates are real working files. Don't make them mock data or stubs; everything the CLI emits should compile and run as-is (modulo the TODO markers for customization).
- The `{{#if}}` templating is deliberately minimal. Don't add `{{#unless}}`, `{{#each}}`, or helper functions. If a template needs complex logic, generate it in TypeScript rather than in template syntax.
- Prompt count matters. The current design asks 7 questions; more than 10 and developers start skipping. Resist the urge to ask about optional features — default those and let developers opt in via code changes later.
- The generated Payload config has stubbed resolvers for users and groups. These MUST be replaced before the system works; make this obvious via TODO comments and in the post-install output.
- `pnpm create @forumone/claude-cms foo` invokes `@forumone/create-claude-cms`. The `pnpm create` protocol expects the package name to be `@scope/create-<thing>` to match `pnpm create @scope/<thing>`. Verify this resolves correctly before publishing.
- Publishing this package is different from the library packages. Users install it via the `create` protocol, not as a dependency. Test the full flow: publish beta to npm, run `pnpm create @forumone/claude-cms@beta test-project` in a clean directory, verify the output.
- Commit after prompts (C13.3), generator (C13.4), templates (C13.5), and post-install (C13.6). The templates are the most work; if time is short, start with the base template and add `with-reference-ds` later.

## What's next

Phase C14 builds the documentation site. After the CLI exists, a developer knows they can scaffold a project; after the docs exist, they know how to use it. Together they complete the core track and make forumone.com a realistic next step.
