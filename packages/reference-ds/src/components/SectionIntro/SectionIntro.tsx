import { clsx } from 'clsx'
import styles from './SectionIntro.module.css'

export type SectionIntroAlignment = 'start' | 'center'

export interface SectionIntroProps {
  eyebrow?: string
  headline: string
  body?: string
  alignment?: SectionIntroAlignment
  className?: string
}

export function SectionIntro({
  eyebrow,
  headline,
  body,
  alignment = 'start',
  className,
}: SectionIntroProps) {
  return (
    <header className={clsx(styles.intro, styles[alignment], className)}>
      {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
      <h2 className={styles.headline}>{headline}</h2>
      {body ? <p className={styles.body}>{body}</p> : null}
    </header>
  )
}
