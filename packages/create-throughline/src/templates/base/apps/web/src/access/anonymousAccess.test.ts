import { describeAnonymousAccess } from '@forumone/throughline/testing'
import config from '../payload.config'

/*
What a reader with no account can read, as values — no database.

Every query the public site makes runs with nobody signed in, so a collection's
own `read` rule decides whether a page can see its content. Close one by
mistake and nothing errors: the page renders empty. Open the wrong one and the
audit log, the approval queue or the MCP keys are on the internet.

Every collection in the config — yours and the ones the plugins bring — has to
be in exactly one bucket below. **Adding a collection fails this test until you
put it in one.** Say where the site reads it, or why it is private.
*/
describeAnonymousAccess(config, {
  renderPath: {
    // Anonymous reads see published pages only; signed-in users see drafts.
    pages: 'the page routes, once the frontend renders them',
    // formsPlugin opens form definitions so a page can render the fields.
    forms: 'any page that embeds a form',
  },
  private: {
    users: 'accounts',
    'payload-mcp-api-keys': 'MCP keys are credentials; narrowed to admins in payload.config.ts',
    'audit-events': 'who did what',
    approvals: 'who signed off on what',
    'form-submissions': 'what readers typed into a form',
    integrations: 'connection settings and sync state',
    'job-failures': 'background jobs that ran out of retries, with their errors',
    'payload-kv': 'the key-value store Payload keeps',
    'payload-locked-documents': 'who is editing what',
    'payload-preferences': 'admin UI state',
    'payload-migrations': 'the migration history',
  },
})
