import type { Meta, StoryObj } from '@storybook/react-vite'
import { Prose } from './Prose.js'

const meta: Meta<typeof Prose> = {
  title: 'Prose',
  component: Prose,
}

export default meta

type Story = StoryObj<typeof Prose>

const sampleContent = (
  <>
    <h2>Why content-first CMSes matter</h2>
    <p>
      A content management system should help editorial teams describe the world accurately, not
      force them into a grid of tiles and buckets. When the CMS models the world well, the rest of
      the work — rendering, governance, publication — becomes tractable.
    </p>
    <h3>The three pillars</h3>
    <ul>
      <li>Content models that describe intent, not layout</li>
      <li>Governance that encodes approval policy</li>
      <li>Publication that&apos;s reversible and auditable</li>
    </ul>
    <blockquote>
      &ldquo;The best CMS is the one your editors forget they are using.&rdquo;
    </blockquote>
    <p>
      Everything else is detail. The reference design system exists to prove the framework can
      ship a working, accessible, and accountable editorial experience with just a dozen components.
    </p>
  </>
)

export const Default: Story = { args: { children: sampleContent } }
export const Compact: Story = { args: { size: 'compact', children: sampleContent } }
export const Spacious: Story = { args: { size: 'spacious', children: sampleContent } }
