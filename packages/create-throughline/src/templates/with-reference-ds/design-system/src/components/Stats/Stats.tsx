import { clsx } from 'clsx'
import styles from './Stats.module.css'

export interface StatItem {
  value: string
  label: string
  description?: string
}

export interface StatsProps {
  eyebrow?: string
  headline?: string
  items: StatItem[]
  className?: string
}

export function Stats({ eyebrow, headline, items, className }: StatsProps) {
  return (
    <section className={clsx(styles.stats, className)}>
      <div className={styles.container}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        {headline ? <h2 className={styles.headline}>{headline}</h2> : null}
        <dl className={clsx(styles.list, styles[`cols-${items.length}`])}>
          {items.map((item) => (
            <div key={`${item.value}-${item.label}`} className={styles.item}>
              <dt className={styles.value}>{item.value}</dt>
              <dd className={styles.label}>
                <span className={styles.labelText}>{item.label}</span>
                {item.description ? (
                  <span className={styles.description}>{item.description}</span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
