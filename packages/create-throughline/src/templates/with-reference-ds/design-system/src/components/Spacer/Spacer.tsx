import { clsx } from 'clsx'
import styles from './Spacer.module.css'

export type SpacerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface SpacerProps {
  size?: SpacerSize
  className?: string
}

export function Spacer({ size = 'md', className }: SpacerProps) {
  return (
    <div
      aria-hidden="true"
      role="presentation"
      className={clsx(styles.spacer, styles[size], className)}
    />
  )
}
