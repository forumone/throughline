import { clsx } from 'clsx'
import styles from './Divider.module.css'

export type DividerSpacing = 'compact' | 'default' | 'spacious'

export interface DividerProps {
  spacing?: DividerSpacing
  decorative?: boolean
  className?: string
}

export function Divider({ spacing = 'default', decorative = true, className }: DividerProps) {
  const ariaProps = decorative
    ? { role: 'presentation', 'aria-hidden': true as const }
    : {}
  return <hr {...ariaProps} className={clsx(styles.divider, styles[spacing], className)} />
}
