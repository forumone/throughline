import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import styles from './FAQ.module.css'

export interface FAQItem {
  question: string
  answer: ReactNode
}

export interface FAQProps {
  headline?: string
  items: FAQItem[]
  /** If true, the first item is open by default. */
  defaultOpenFirst?: boolean
  className?: string
}

export function FAQ({ headline, items, defaultOpenFirst = false, className }: FAQProps) {
  return (
    <section className={clsx(styles.faq, className)}>
      <div className={styles.container}>
        {headline ? <h2 className={styles.headline}>{headline}</h2> : null}
        <ul className={styles.list}>
          {items.map((item, index) => (
            <li key={item.question}>
              <details className={styles.item} open={defaultOpenFirst && index === 0}>
                <summary className={styles.question}>
                  <span>{item.question}</span>
                  <span aria-hidden="true" className={styles.chevron}>
                    +
                  </span>
                </summary>
                <div className={styles.answer}>{item.answer}</div>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
