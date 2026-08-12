import { clsx } from 'clsx'
import styles from './Card.module.css'

export interface CardProps {
  title: string
  description?: string
  image?: { url: string; alt: string }
  link?: { label: string; url: string }
  eyebrow?: string
  className?: string
}

export function Card({ title, description, image, link, eyebrow, className }: CardProps) {
  const body = (
    <>
      {image ? (
        <div className={styles.imageFrame}>
          <img src={image.url} alt={image.alt} className={styles.image} />
        </div>
      ) : null}
      <div className={styles.content}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h3 className={styles.title}>{title}</h3>
        {description ? <p className={styles.description}>{description}</p> : null}
        {link ? <span className={styles.linkLabel}>{link.label}</span> : null}
      </div>
    </>
  )

  if (link) {
    return (
      <a href={link.url} className={clsx(styles.card, styles.linked, className)}>
        {body}
      </a>
    )
  }

  return <article className={clsx(styles.card, className)}>{body}</article>
}
