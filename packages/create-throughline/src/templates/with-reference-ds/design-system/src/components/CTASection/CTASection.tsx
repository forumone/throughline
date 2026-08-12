import { clsx } from 'clsx'
import styles from './CTASection.module.css'

export type CTASectionBackground = 'primary' | 'secondary' | 'inverse'

export interface CTASectionProps {
  headline: string
  body?: string
  cta: { label: string; url: string }
  secondaryCta?: { label: string; url: string }
  background?: CTASectionBackground
  className?: string
}

export function CTASection({
  headline,
  body,
  cta,
  secondaryCta,
  background = 'secondary',
  className,
}: CTASectionProps) {
  return (
    <section className={clsx(styles.cta, styles[`bg-${background}`], className)}>
      <div className={styles.container}>
        <h2 className={styles.headline}>{headline}</h2>
        {body ? <p className={styles.body}>{body}</p> : null}
        <div className={styles.actions}>
          <a href={cta.url} className={styles.primary}>
            {cta.label}
          </a>
          {secondaryCta ? (
            <a href={secondaryCta.url} className={styles.secondary}>
              {secondaryCta.label}
            </a>
          ) : null}
        </div>
      </div>
    </section>
  )
}
