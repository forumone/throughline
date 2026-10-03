import type { Meta, StoryObj } from '@storybook/react-vite'
import { typography } from '../tokens'
import { FoundationPage, TokenTable } from './_helpers.tsx'

const meta: Meta = {
  title: 'Foundations/Typography',
}
export default meta

function cssVar(name: string): string {
  return `--${name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/\./g, '-')}`
}

const sizes = Object.entries(typography).filter(([k]) => k.startsWith('font.size.'))
const families = Object.entries(typography).filter(([k]) => k.startsWith('font.family.'))
const weights = Object.entries(typography).filter(([k]) => k.startsWith('font.weight.'))

export const Typography: StoryObj = {
  render: () => (
    <FoundationPage
      title="Typography"
      intro="Type sizes form a single scale; hierarchy comes from size and weight, not from mixing typefaces. The font family is a token, so a brand swap (e.g. DM Sans) re-themes every component."
    >
      <h2 style={{ fontSize: 'var(--font-size-xl)', margin: '0 0 1rem' }}>Type scale</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2.5rem' }}>
        {sizes.map(([name, value]) => (
          <div key={name} style={{ display: 'flex', alignItems: 'baseline', gap: '1rem' }}>
            <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', width: '8rem', flexShrink: 0 }}>
              {cssVar(name)}
            </span>
            <span style={{ fontSize: value, lineHeight: 1.1 }}>The quick brown fox</span>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 'var(--font-size-xl)', margin: '0 0 1rem' }}>Families</h2>
      <TokenTable
        rows={families.map(([name, value]) => ({
          name: cssVar(name),
          value,
          preview: <span style={{ fontFamily: value }}>Aa Bb Cc 123</span>,
        }))}
      />

      <h2 style={{ fontSize: 'var(--font-size-xl)', margin: '2.5rem 0 1rem' }}>Weights</h2>
      <TokenTable
        rows={weights.map(([name, value]) => ({
          name: cssVar(name),
          value,
          preview: <span style={{ fontWeight: value as number }}>The quick brown fox</span>,
        }))}
      />
    </FoundationPage>
  ),
}
