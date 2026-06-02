import type { Meta, StoryObj } from '@storybook/react-vite'
import { layout } from '../tokens'
import { FoundationPage, TokenTable } from './_helpers.tsx'

const meta: Meta = {
  title: 'Foundations/Layout & Containers',
}
export default meta

/** Token name → CSS custom property (mirrors build-tokens-css). */
function cssVar(name: string): string {
  return `--${name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/\./g, '-')}`
}

const containers = Object.entries(layout).filter(([k]) => k.startsWith('layout.container.'))
const breakpoints = Object.entries(layout).filter(([k]) => k.startsWith('layout.breakpoint.'))
const gutter = layout['layout.gutter']
const margin = layout['layout.margin']

export const LayoutAndContainers: StoryObj = {
  render: () => (
    <FoundationPage
      title="Layout & Containers"
      intro="Page content constrains to one of a small set of max-widths. The gutter is the space between grid columns; the page margin is the breathing room between the container and the viewport edge. Breakpoints are min-width and progressively widen the layout."
    >
      <h2 style={{ fontSize: 'var(--font-size-xl)', margin: '0 0 1rem' }}>Container widths</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2.5rem' }}>
        {containers.map(([name, value]) => (
          <div key={name}>
            <div
              style={{
                fontFamily: 'var(--font-family-mono)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                marginBottom: '0.25rem',
              }}
            >
              {cssVar(name)} · {value}
            </div>
            <div
              style={{
                height: '2rem',
                width: `min(100%, ${value})`,
                background: 'var(--color-brand-primary)',
                borderRadius: 'var(--radius-sm)',
              }}
            />
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 'var(--font-size-xl)', margin: '0 0 1rem' }}>Gutter & page margin</h2>
      <TokenTable
        rows={[
          {
            name: cssVar('layout.gutter'),
            value: gutter,
            preview: <div style={{ height: '1rem', width: gutter, background: 'var(--color-brand-secondary)' }} />,
          },
          {
            name: cssVar('layout.margin'),
            value: margin,
            preview: <div style={{ height: '1rem', width: margin, background: 'var(--color-brand-secondary)' }} />,
          },
        ]}
      />

      <h2 style={{ fontSize: 'var(--font-size-xl)', margin: '2.5rem 0 1rem' }}>Breakpoints</h2>
      <TokenTable
        rows={breakpoints.map(([name, value]) => ({
          name: cssVar(name),
          value,
          preview: (
            <div
              style={{
                height: '0.5rem',
                width: `min(100%, calc(${value} / 4))`,
                background: 'var(--color-border-strong)',
              }}
            />
          ),
        }))}
      />
    </FoundationPage>
  ),
}
