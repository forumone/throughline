import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import styles from './Prose.module.css'

export type ProseSize = 'default' | 'compact' | 'spacious'

export interface ProseProps {
  children: ReactNode
  size?: ProseSize
  className?: string
}

export function Prose({ children, size = 'default', className }: ProseProps) {
  return <div className={clsx(styles.prose, styles[size], className)}>{children}</div>
}
