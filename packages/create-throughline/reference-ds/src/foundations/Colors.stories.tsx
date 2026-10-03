import type { Meta, StoryObj } from '@storybook/react-vite'
import { colors } from '../tokens'
import { FoundationPage } from './_helpers.tsx'

const meta: Meta = {
  title: 'Foundations/Colors',
}
export default meta

function cssVar(name: string): string {
  return `--${name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/\./g, '-')}`
}

const groups = ['neutral', 'brand', 'text', 'bg', 'border', 'state']

export const Colors: StoryObj = {
  render: () => (
    <FoundationPage
      title="Colors"
      intro="The palette is grouped by role: neutral ramp, brand accents, text, background, border, and state. Components read these as CSS custom properties so a brand override re-themes everything without touching component code."
    >
      {groups.map((group) => {
        const entries = Object.entries(colors).filter(([k]) => k.startsWith(`color.${group}.`))
        if (entries.length === 0) return null
        return (
          <section key={group} style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: 'var(--font-size-lg)', margin: '0 0 0.75rem', textTransform: 'capitalize' }}>
              {group}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(9rem, 1fr))', gap: '0.75rem' }}>
              {entries.map(([name, value]) => (
                <div key={name} style={{ border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <div style={{ height: '3.5rem', background: value }} />
                  <div style={{ padding: '0.5rem' }}>
                    <div style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)' }}>{cssVar(name)}</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </FoundationPage>
  ),
}
