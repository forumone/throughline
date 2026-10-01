import { postgresAdapter } from '@payloadcms/db-postgres'
import { buildConfig } from 'payload'
import { playgroundConfig } from './config'

/*
The playground on Postgres, for `pnpm dev` (`pnpm db:up` starts it). Everything
else lives in `./config.ts`, which the end-to-end test boots on SQLite.
*/
export default buildConfig(
  playgroundConfig({
    db: postgresAdapter({
      pool: {
        connectionString: process.env.DATABASE_URI ?? '',
      },
    }),
  }),
)
