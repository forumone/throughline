import { clsx } from 'clsx'
import styles from './Hero.module.css'

export type HeroVariant = 'default' | 'compact' | 'split'
export type HeroBackground = 'primary' | 'secondary' | 'inverse'

export interface HeroProps {
  eyebrow?: string
  headline: string
  body?: string
  cta?: { label: string; url: string }
  secondaryCta?: { label: string; url: string }
  media?: { url: string; alt: string }
  variant?: HeroVariant
  background?: HeroBackground
  className?: string
}

export function Hero({
  eyebrow,
  headline,
  body,
  cta,
  secondaryCta,
  media,
  variant = 'default',
  background = 'primary',
  className,
}: HeroProps) {
  return (
    <section
      className={clsx(
        styles.hero,
        styles[variant],
        styles[`bg-${background}`],
        className,
      )}
    >
      <div className={styles.container}>
        <div className={styles.content}>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <h1 className={styles.headline}>{headline}</h1>
          {body ? <p className={styles.body}>{body}</p> : null}
          {cta || secondaryCta ? (
            <div className={styles.actions}>
              {cta ? (
                <a href={cta.url} className={styles.primaryCta}>
                  {cta.label}
                </a>
              ) : null}
              {secondaryCta ? (
                <a href={secondaryCta.url} className={styles.secondaryCta}>
                  {secondaryCta.label}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
        {variant === 'split' && media ? (
          <div className={styles.media}>
            <img src={media.url} alt={media.alt} />
          </div>
        ) : null}
      </div>
    </section>
  )
}
