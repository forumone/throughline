import type { Meta, StoryObj } from '@storybook/react-vite'
import { FoundationPage } from './_helpers.tsx'

const meta: Meta = {
  title: 'Foundations/Elevation',
}
export default meta

export const Elevation: StoryObj = {
  render: () => (
    <FoundationPage
      title="Elevation"
      intro="The reference design system uses flat depth: elevation is expressed through 1px borders and surface-color shifts rather than drop shadows. Reserve real shadows for transient overlays (modals, popovers)."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 1fr))', gap: '1rem' }}>
        <div style={{ padding: '1.5rem', background: 'var(--color-bg-primary)', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-lg)' }}>
          <strong>Surface</strong>
          <p style={{ margin: '0.5rem 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            bg.primary + border.default
          </p>
        </div>
        <div style={{ padding: '1.5rem', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-lg)' }}>
          <strong>Raised</strong>
          <p style={{ margin: '0.5rem 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            bg.secondary + border.strong
          </p>
        </div>
        <div style={{ padding: '1.5rem', background: 'var(--color-bg-primary)', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-lg)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
          <strong>Overlay</strong>
          <p style={{ margin: '0.5rem 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            shadow — modals / popovers only
          </p>
        </div>
      </div>
    </FoundationPage>
  ),
}
