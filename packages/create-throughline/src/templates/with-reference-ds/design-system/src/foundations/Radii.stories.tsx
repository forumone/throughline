import type { Meta, StoryObj } from '@storybook/react-vite'
import { radii } from '../tokens'
import { FoundationPage } from './_helpers.tsx'

const meta: Meta = {
  title: 'Foundations/Radii',
}
export default meta

function cssVar(name: string): string {
  return `--${name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/\./g, '-')}`
}

export const Radii: StoryObj = {
  render: () => (
    <FoundationPage
      title="Radii"
      intro="Corner radii available to components. A brand may collapse this to a binary set (sharp vs. pill); the tokens stay the same so components don't change."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: '1rem' }}>
        {Object.entries(radii).map(([name, value]) => (
          <div key={name}>
            <div
              style={{
                height: '5rem',
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border-strong)',
                borderRadius: value,
              }}
            />
            <div style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', marginTop: '0.5rem' }}>{cssVar(name)}</div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{value}</div>
          </div>
        ))}
      </div>
    </FoundationPage>
  ),
}
