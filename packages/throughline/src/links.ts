/*
The link-target marker, on a subpath of its own (forumone-2026#756).

A site's link field is usually one helper that both the Payload config and a
`'use client'` admin component import. `/publishing` is the server plugin and
cannot reach a client bundle, and `/fields` pulls in the MCP and audit modules,
so the marker is exported here as well: this module and everything it imports
load nothing at run time, like `/cache-tags`. `./links.test.ts` holds it to
that.
*/
export { LINK_TARGET_KEY, linkTargetMarker, markLinkTarget } from './references/links.js'
export type { LinkTargetMarker } from './references/links.js'
