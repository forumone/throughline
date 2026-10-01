/*
What the smoke pack checks, and where. Site data: change the paths here, not in
the specs.

**What the pack does not check yet, because a fresh project does not serve it.**
Each is a check worth adding with the route that makes it true:

  - security headers — `next.config.mjs` sets none. Add `headers()` there, then
    assert them per route: HSTS, `nosniff`, a referrer policy, and framing
    (`DENY` on `/admin`, `SAMEORIGIN` where live preview frames the site).
  - `robots.txt` and `sitemap.xml` — add `app/robots.ts` and `app/sitemap.ts`;
    assert a 200, the content type, and that the sitemap lists each URL once.
  - `llms.txt` — a route serving `text/markdown`, with a heading and links.
  - draft mode — a preview route must refuse a request without its secret
    (401) and one naming no document (400).
*/
export const site = {
  /**
   * A deployed site to point at, from `E2E_BASE_URL`. Unset, the pack starts
   * `next start` locally on `port`.
   */
  baseURL: process.env.E2E_BASE_URL?.trim() || undefined,
  port: 3100,

  /** The front door. */
  home: '/',
  /** The Payload admin. On an empty database it asks for the first user. */
  admin: '/admin',
  /** A path nothing serves, which must be a 404 and never a 500. */
  missing: '/a-page-that-was-never-written',

  /** REST collections an anonymous request must be refused. */
  privateCollections: ['users', 'payload-mcp-api-keys'],
  /** REST collections an anonymous request may read — published documents only. */
  publicCollections: ['pages'],
}
