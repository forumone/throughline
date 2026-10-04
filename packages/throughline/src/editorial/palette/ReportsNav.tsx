'use client'

import { NavGroup, useConfig } from '@payloadcms/ui'
import NextLinkImport from 'next/link.js'
import { usePathname } from 'next/navigation.js'
import type { Report } from './sources.js'

// `next/link` is CommonJS: under NodeNext its default import is the module, so
// unwrap it as Payload's own UI does.
const Link = 'default' in NextLinkImport ? NextLinkImport.default : NextLinkImport

/*
The sidebar's "Reports" group: the admin's own screens, which are not
collections and so get no link from Payload's nav. Drawn with Payload's classes,
so an entry here looks and highlights exactly like a collection's. From
forumone-2026's `admin/ReportsNav.tsx`.

`editorialPlugin` adds it after the collection groups, with the views it
registered and any the site adds: the sidebar is where editors go to reach
content, and a report above Content pushed it down.
*/

export function ReportsNav({
  reports = [],
  label = 'Reports',
}: {
  reports?: Report[]
  /** The group's heading. `mcpOAuth` reuses this for its own link. */
  label?: string
}) {
  const pathname = usePathname()
  const {
    config: {
      routes: { admin },
    },
  } = useConfig()

  if (reports.length === 0) return null

  return (
    <NavGroup label={label}>
      {reports.map(({ path, label: text }) => {
        const href = `${admin}${path}`
        const active = pathname === href || pathname.startsWith(`${href}/`)
        const content = (
          <>
            {active && <div className="nav__link-indicator" />}
            <span className="nav__link-label">{text}</span>
          </>
        )
        return pathname === href ? (
          <div key={path} className="nav__link">
            {content}
          </div>
        ) : (
          <Link key={path} className="nav__link" href={href} prefetch={false}>
            {content}
          </Link>
        )
      })}
    </NavGroup>
  )
}
