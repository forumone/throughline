import { clsx } from 'clsx'
import styles from './Quote.module.css'

export type QuoteSize = 'default' | 'large'

export interface QuoteProps {
  quote: string
  attribution?: {
    name: string
    role?: string
    avatar?: { url: string; alt: string }
  }
  size?: QuoteSize
  className?: string
}

export function Quote({ quote, attribution, size = 'default', className }: QuoteProps) {
  return (
    <figure className={clsx(styles.figure, styles[size], className)}>
      <blockquote className={styles.quote}>
        <p>{quote}</p>
      </blockquote>
      {attribution ? (
        <figcaption className={styles.attribution}>
          {attribution.avatar ? (
            <img
              src={attribution.avatar.url}
              alt={attribution.avatar.alt}
              className={styles.avatar}
            />
          ) : null}
          <span className={styles.name}>{attribution.name}</span>
          {attribution.role ? (
            <span className={styles.role}>{attribution.role}</span>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  )
}
