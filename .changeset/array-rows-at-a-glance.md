---
'@forumone/throughline-design-system-payload': minor
---

A generated array's rows can be read without opening them.

- A row made only of two or three short single-line text fields — a stat's
  figure and label, a fact's label and value — is drawn on one line, each
  field as wide as its `maxLength` against the others', and never under a
  quarter of the line for two fields.
- A row's header says what it holds: "96% · of users reached the form" or
  "Client · USAID", read from its first one or two plain-text fields, instead
  of "Stat 03". An empty row keeps Payload's own counter. Settings, `advanced`
  fields and a call to action's label never name a row.

Both are drawing only: stored data and generated types are unchanged. The row
header is a client component at
`@forumone/throughline-design-system-payload/client#RowSummary`, so a host
regenerates its import map, and `@payloadcms/ui` is now a peer dependency.
