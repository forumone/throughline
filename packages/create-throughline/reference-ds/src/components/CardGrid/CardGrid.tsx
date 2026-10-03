import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import styles from './CardGrid.module.css'

export type CardGridColumns = 2 | 3 | 4

export interface CardGridProps {
  children: ReactNode
  columns?: CardGridColumns
  className?: string
}

export function CardGrid({ children, columns = 3, className }: CardGridProps) {
  return (
    <div className={clsx(styles.grid, styles[`cols-${columns}`], className)}>
      {children}
    </div>
  )
}
