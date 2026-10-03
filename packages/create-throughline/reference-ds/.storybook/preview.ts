import type { Preview } from '@storybook/react-vite'
import '../src/styles/reset.css'
import '../src/styles/tokens.css'
import '../src/styles/base.css'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    a11y: {
      config: {},
      options: {},
      manual: false,
    },
  },
}

export default preview
