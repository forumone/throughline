import type { CSSProperties, ReactNode } from 'react'

/** Shared layout chrome for every Foundations page. */
export function FoundationPage({
  title,
  intro,
  children,
}: {
  title: string
  intro?: string
  children: ReactNode
}) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-family-sans)',
        color: 'var(--color-text-primary)',
        background: 'var(--color-bg-primary)',
        padding: '2rem',
        maxWidth: '64rem',
      }}
    >
      <h1 style={{ fontSize: 'var(--font-size-4xl)', margin: '0 0 0.5rem', lineHeight: 1.15 }}>
        {title}
      </h1>
      {intro ? (
        <p
          style={{
            color: 'var(--color-text-secondary)',
            margin: '0 0 2rem',
            maxWidth: '42rem',
            lineHeight: 'var(--line-height-relaxed)',
          }}
        >
          {intro}
        </p>
      ) : null}
      {children}
    </div>
  )
}

const cell: CSSProperties = {
  textAlign: 'left',
  padding: '0.5rem 0.75rem',
  borderBottom: '1px solid var(--color-border-default)',
  verticalAlign: 'middle',
}

/** A simple token reference table: name, resolved value, and a preview cell. */
export function TokenTable({
  rows,
}: {
  rows: Array<{ name: string; value: string; preview?: ReactNode }>
}) {
  return (
    <table
      style={{
        borderCollapse: 'collapse',
        width: '100%',
        fontSize: 'var(--font-size-sm)',
      }}
    >
      <thead>
        <tr>
          <th style={{ ...cell, color: 'var(--color-text-muted)', fontWeight: 600 }}>Token</th>
          <th style={{ ...cell, color: 'var(--color-text-muted)', fontWeight: 600 }}>Value</th>
          <th style={{ ...cell, color: 'var(--color-text-muted)', fontWeight: 600 }}>Preview</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td style={{ ...cell, fontFamily: 'var(--font-family-mono)' }}>{row.name}</td>
            <td style={{ ...cell, color: 'var(--color-text-secondary)' }}>{row.value}</td>
            <td style={cell}>{row.preview}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
