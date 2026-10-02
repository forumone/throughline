'use client'

import { useAuth, useConfig, usePreferences } from '@payloadcms/ui'
import { usePathname, useRouter } from 'next/navigation.js'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  byIdsUrl,
  documentFromPath,
  matchCommands,
  matchRank,
  pushRecent,
  readRecent,
  searchUrl,
  type Command,
  type RecentEntry,
  type Report,
  type SearchSource,
} from './sources.js'
import { PALETTE_CSS } from './styles.js'

/*
Cmd-K (Ctrl-K elsewhere), from any admin screen: find a document by a few
letters of its title, whatever collection it is in, or jump to a screen. From
forumone-2026's `admin/palette/CommandPalette.tsx` (#760 there).

An admin `provider`, so it is mounted once around the whole admin and survives
navigation. It renders its children untouched and, while open, a native
`<dialog>`, which brings focus trapping, Escape and the backdrop with it.
`editorialPlugin` registers it, passing the site's sources and the reports as
`clientProps`.

Three kinds of result:

- **Documents**, from one REST `find` per source (`searchUrl`), read with the
  viewer's own cookie, so nothing appears that they could not open.
- **Commands**: "Go to" every collection, global and report the viewer can read,
  and "New …" for the collections they can create in.
- **Recently opened**, before anything is typed. Kept in Payload's own per-user
  preferences, so it follows the person across browsers, and read back through
  the same access-controlled REST.

"Recently opened" rather than "recently edited", because nothing records who
edited a document.
*/

const DEBOUNCE_MS = 150

export interface CommandPaletteProps {
  children?: ReactNode
  /** What it searches, in the order results are grouped. */
  sources: SearchSource[]
  /** Screens that are not collections, offered as "Go to". */
  reports?: Report[]
  /** Collections offered as "New …". Default: every source. */
  creatable?: string[]
  /** The per-user preference the recent list is kept in. */
  preferenceKey?: string
}

interface Item {
  key: string
  label: string
  hint: string
  href: string
}

function labelOf(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

async function titles(
  url: string,
  source: SearchSource,
  signal: AbortSignal,
): Promise<{ id: number | string; title: string }[]> {
  const response = await fetch(url, { credentials: 'include', signal })
  if (!response.ok) return []
  const { docs } = (await response.json()) as { docs?: Record<string, unknown>[] }
  return (docs ?? []).map((doc) => {
    const value = doc[source.titleField]
    return {
      id: doc['id'] as number | string,
      title: typeof value === 'string' && value !== '' ? value : 'Untitled',
    }
  })
}

interface PaletteProps {
  apiBase: string
  adminRoute: string
  commands: Command[]
  sources: SearchSource[]
  singular: Map<string, string>
  loadRecent: () => Promise<RecentEntry[]>
  onClose: () => void
}

function Palette({
  apiBase,
  adminRoute,
  commands,
  sources,
  singular,
  loadRecent,
  onClose,
}: PaletteProps) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const listId = useId()
  const [query, setQuery] = useState('')
  const [documents, setDocuments] = useState<Item[]>([])
  const [recent, setRecent] = useState<Item[]>([])
  const [searching, setSearching] = useState(false)
  const [active, setActive] = useState(0)

  /*
  Opened with `showModal()`. Every way of closing it (Escape, a backdrop click,
  choosing a result) calls `onClose` directly, which unmounts the dialog, rather
  than waiting for the native `close` event: that event is queued and does not
  arrive at all in a hidden tab, and React's `onClose` prop missed Escape, which
  left the dialog mounted and closed so the next Cmd-K toggled it shut. The
  listener stays as a fallback for any close this code did not start.
  */
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (!element.open) element.showModal()
    element.addEventListener('close', onClose)
    return () => element.removeEventListener('close', onClose)
  }, [onClose])

  const docHref = useCallback(
    (collection: string, id: number | string) =>
      `${adminRoute}/collections/${collection}/${encodeURIComponent(String(id))}`,
    [adminRoute],
  )

  // Recently opened, once, in the order they were opened.
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      const entries = await loadRecent().catch(() => [])
      const bySource = new Map<string, RecentEntry[]>()
      for (const entry of entries) {
        const list = bySource.get(entry.collection) ?? []
        list.push(entry)
        bySource.set(entry.collection, list)
      }
      const found = new Map<string, string>()
      await Promise.allSettled(
        sources
          .filter((source) => bySource.has(source.slug))
          .map(async (source) => {
            const ids = (bySource.get(source.slug) ?? []).map((entry) => entry.id)
            for (const row of await titles(
              byIdsUrl(apiBase, source, ids),
              source,
              controller.signal,
            ))
              found.set(`${source.slug}:${String(row.id)}`, row.title)
          }),
      )
      if (controller.signal.aborted) return
      setRecent(
        entries.flatMap((entry) => {
          const title = found.get(`${entry.collection}:${entry.id}`)
          if (title === undefined) return []
          return [
            {
              key: `recent:${entry.collection}:${entry.id}`,
              label: title,
              hint: singular.get(entry.collection) ?? entry.collection,
              href: docHref(entry.collection, entry.id),
            },
          ]
        }),
      )
    })()
    return () => controller.abort()
  }, [apiBase, docHref, loadRecent, singular, sources])

  // Documents, debounced; a newer keystroke aborts the older requests.
  useEffect(() => {
    const q = query.trim()
    if (q === '') {
      setDocuments([])
      setSearching(false)
      return
    }
    const controller = new AbortController()
    setSearching(true)
    const timer = setTimeout(() => {
      void Promise.allSettled(
        sources.map(async (source) =>
          (await titles(searchUrl(apiBase, source, q), source, controller.signal)).map((row) => ({
            key: `doc:${source.slug}:${String(row.id)}`,
            label: row.title,
            hint: singular.get(source.slug) ?? source.slug,
            href: docHref(source.slug, row.id),
            rank: matchRank(row.title, q),
          })),
        ),
      ).then((settled) => {
        if (controller.signal.aborted) return
        const rows = settled.flatMap((result) =>
          result.status === 'fulfilled' ? result.value : [],
        )
        // Stable sort: best match first, source order within a rank.
        rows.sort((a, b) => a.rank - b.rank)
        setDocuments(rows)
        setSearching(false)
      })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [apiBase, docHref, query, singular, sources])

  const items = useMemo<Item[]>(() => {
    if (query.trim() === '') return recent
    const matched = matchCommands(commands, query)
      .slice(0, 4)
      .map((command) => ({
        key: command.id,
        label: command.label,
        hint: command.hint,
        href: command.href,
      }))
    return [...documents, ...matched]
  }, [commands, documents, query, recent])

  useEffect(() => setActive(0), [items])

  const go = (item: Item | undefined) => {
    if (!item) return
    onClose()
    router.push(item.href)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, items.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Escape') {
      // A search input clears itself on Escape; close instead.
      event.preventDefault()
      onClose()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      go(items[active])
    }
  }

  const status =
    query.trim() === ''
      ? recent.length === 0
        ? 'Type to search by title.'
        : 'Recently opened'
      : searching && items.length === 0
        ? 'Searching…'
        : items.length === 0
          ? 'Nothing matches.'
          : null

  return (
    <dialog
      ref={dialog}
      className="tl-palette"
      aria-label="Search the admin"
      onCancel={(event) => {
        // Escape. Unmount rather than let the browser close it; see above.
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog itself.
        if (event.target === dialog.current) onClose()
      }}
    >
      <input
        className="tl-palette__input"
        type="search"
        role="combobox"
        aria-expanded={items.length > 0}
        aria-controls={listId}
        aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        placeholder="Search by title, or go to…"
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {status && (
        <p className="tl-palette__status" role="status">
          {status}
        </p>
      )}
      <ul className="tl-palette__list" id={listId} role="listbox" aria-label="Results">
        {items.map((item, index) => (
          <li
            key={item.key}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            className="tl-palette__item"
            onMouseMove={() => setActive(index)}
            onClick={() => go(item)}
          >
            <span className="tl-palette__label">{item.label}</span>
            <span className="tl-palette__hint">{item.hint}</span>
          </li>
        ))}
      </ul>
      <p className="tl-palette__keys" aria-hidden="true">
        ↑↓ to move · Enter to open · Esc to close
      </p>
    </dialog>
  )
}

export function CommandPalette({
  children,
  sources,
  reports = [],
  creatable,
  preferenceKey = 'throughline-command-palette-recent',
}: CommandPaletteProps) {
  const { user, permissions } = useAuth()
  const { config } = useConfig()
  const { getPreference, setPreference } = usePreferences()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { admin } = config.routes
  const searched = useMemo(() => sources.map((source) => source.slug), [sources])

  useEffect(() => {
    if (!user) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || event.altKey || event.shiftKey) return
      if (!(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      setOpen((value) => !value)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [user])

  // Remember each document editor the person opens.
  useEffect(() => {
    if (!user) return
    const entry = documentFromPath(pathname, admin, searched)
    if (!entry) return
    let cancelled = false
    void getPreference<unknown>(preferenceKey)
      .then((stored) => {
        if (cancelled) return
        const current = readRecent(stored)
        if (current[0]?.collection === entry.collection && current[0]?.id === entry.id) return
        return setPreference(preferenceKey, pushRecent(current, entry))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [pathname, admin, user, getPreference, setPreference, preferenceKey, searched])

  /** Collection slug to singular label, for the hint beside each result. */
  const singular = useMemo(() => {
    const map = new Map<string, string>()
    for (const collection of config.collections)
      map.set(collection.slug, labelOf(collection.labels?.singular, collection.slug))
    return map
  }, [config.collections])

  const canRead = useCallback(
    (slug: string) => Boolean(permissions?.collections?.[slug]?.read),
    [permissions],
  )

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = []
    for (const report of reports)
      list.push({
        id: `report:${report.path}`,
        label: report.label,
        hint: 'Go to',
        href: `${admin}${report.path}`,
        ...(report.keywords ? { keywords: report.keywords } : {}),
      })
    for (const collection of config.collections) {
      if (!canRead(collection.slug)) continue
      if (collection.admin?.group === false) continue
      list.push({
        id: `collection:${collection.slug}`,
        label: labelOf(collection.labels?.plural, collection.slug),
        hint: 'Go to',
        href: `${admin}/collections/${collection.slug}`,
        keywords: collection.slug,
      })
    }
    for (const global of config.globals) {
      if (!permissions?.globals?.[global.slug]?.read) continue
      list.push({
        id: `global:${global.slug}`,
        label: labelOf(global.label, global.slug),
        hint: 'Go to',
        href: `${admin}/globals/${global.slug}`,
        keywords: global.slug,
      })
    }
    for (const slug of creatable ?? searched) {
      if (!permissions?.collections?.[slug]?.create) continue
      list.push({
        id: `create:${slug}`,
        label: singular.get(slug) ?? slug,
        hint: 'New',
        href: `${admin}/collections/${slug}/create`,
        keywords: 'create add',
      })
    }
    return list
  }, [
    admin,
    canRead,
    config.collections,
    config.globals,
    creatable,
    permissions,
    reports,
    searched,
    singular,
  ])

  const readable = useMemo(
    () => sources.filter((source) => canRead(source.slug)),
    [canRead, sources],
  )
  const loadRecent = useCallback(
    async () => readRecent(await getPreference<unknown>(preferenceKey)),
    [getPreference, preferenceKey],
  )
  const close = useCallback(() => setOpen(false), [])

  if (!user) return <>{children}</>

  return (
    <>
      {children}
      {open && (
        <>
          <style href="throughline-palette" precedence="default">
            {PALETTE_CSS}
          </style>
          <Palette
            apiBase={`${config.serverURL}${config.routes.api}`}
            adminRoute={admin}
            commands={commands}
            sources={readable}
            singular={singular}
            loadRecent={loadRecent}
            onClose={close}
          />
        </>
      )}
    </>
  )
}
