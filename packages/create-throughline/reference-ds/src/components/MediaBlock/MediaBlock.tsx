import { clsx } from 'clsx'
import styles from './MediaBlock.module.css'

export type MediaBlockAspect = '16:9' | '4:3' | 'square' | 'auto'

type ImageMedia = { type: 'image'; url: string; alt: string }
type VideoMedia = {
  type: 'video'
  url: string
  poster?: string
  /** Accessible label used when the video lacks audio/captions narrative context. */
  ariaLabel?: string
}

export type MediaBlockMedia = ImageMedia | VideoMedia

export interface MediaBlockProps {
  media: MediaBlockMedia
  caption?: string
  aspect?: MediaBlockAspect
  className?: string
}

export function MediaBlock({
  media,
  caption,
  aspect = '16:9',
  className,
}: MediaBlockProps) {
  const aspectKey = aspect === '16:9' ? 'aspect16x9' : aspect === '4:3' ? 'aspect4x3' : `aspect-${aspect}`
  return (
    <figure className={clsx(styles.figure, className)}>
      <div className={clsx(styles.frame, styles[aspectKey])}>
        {media.type === 'image' ? (
          <img src={media.url} alt={media.alt} className={styles.media} />
        ) : (
          <video
            src={media.url}
            poster={media.poster}
            controls
            aria-label={media.ariaLabel}
            className={styles.media}
          />
        )}
      </div>
      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
    </figure>
  )
}
