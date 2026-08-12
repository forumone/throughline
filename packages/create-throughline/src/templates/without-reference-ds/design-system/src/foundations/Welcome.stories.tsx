import type { Meta, StoryObj } from '@storybook/react-vite'

const meta: Meta = {
  title: 'Foundations/Welcome',
}
export default meta

export const Welcome: StoryObj = {
  render: () => (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '40rem', lineHeight: 1.6 }}>
      <h1>Your design system</h1>
      <p>
        This is an empty Storybook authoring environment. Add components under{' '}
        <code>src/components/</code> with a <code>.stories.tsx</code> story and a{' '}
        <code>.contract.ts</code> contract, and document your tokens in{' '}
        <code>src/foundations/</code> (Colors, Typography, Spacing, Radii, Layout &amp; Containers).
      </p>
      <p>
        Tip: <code>pnpm create @forumone/throughline</code> with the reference design system gives
        you 12 worked examples to start from.
      </p>
    </div>
  ),
}
