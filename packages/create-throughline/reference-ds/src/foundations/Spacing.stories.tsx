import type { Meta, StoryObj } from '@storybook/react-vite'
import { spacing } from '../tokens'
import { FoundationPage } from './_helpers.tsx'

const meta: Meta = {
  title: 'Foundations/Spacing',
}
export default meta

function cssVar(name: string): string {
  return `--${name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/\./g, '-')}`
}

export const Spacing: StoryObj = {
  render: () => (
    <FoundationPage
      title="Spacing"
      intro="A single spacing scale drives padding, margins, and gaps. Section and container spacing are semantic aliases on top of the numeric scale."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {Object.entries(spacing).map(([name, value]) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', width: '11rem', flexShrink: 0 }}>
              {cssVar(name)}
            </span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', width: '4rem', flexShrink: 0 }}>{value}</span>
            <div style={{ height: '1rem', width: value, background: 'var(--color-brand-primary)', borderRadius: 'var(--radius-sm)' }} />
          </div>
        ))}
      </div>
    </FoundationPage>
  ),
}
