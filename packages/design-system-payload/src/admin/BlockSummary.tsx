'use client'

import { Pill, useForm, useRowLabel, useTranslation } from '@payloadcms/ui'
import { summaryText } from './summary'

export interface BlockSummaryProps {
  /** The block's field that names it, if it has one. Injected by the generator via `clientProps`. */
  fields: string[]
  /** The block's label, as the picker shows it — "Collage Hero". */
  singular: string
  /** The block's slug, for Payload's per-block pill class. */
  slug: string
}

/**
 * The header of a generated block — Payload's own, with a better placeholder.
 *
 * Payload draws a block's header as its number, a pill naming the block type,
 * and an input for the optional `blockName` whose placeholder is "Untitled".
 * Nobody types a block name, so a collapsed page read "01 Collage Hero
 * Untitled, 02 Logos Untitled, 03 Statement Section Untitled…", and finding the
 * section about pricing meant opening each block in turn.
 *
 * So this is the same number and pill, with the same classes, followed by what
 * the block holds: its heading as the author is typing it. A block with no text
 * of its own (a carousel, a pair of images) reads "Untitled", as before.
 *
 * A name somebody did type — the importer writes one for a form it could not
 * convert — still wins, in Payload's own editable input. An unnamed block shows
 * its summary as text rather than as the input's placeholder, because the input
 * is sized to what it shows and would then cover the header: a click meant to
 * open the block would start editing a name instead. The trade is that a name
 * can no longer be added to a block that has none, which the summary is what
 * makes unnecessary.
 *
 * Neither the name nor the form is read through `useField`. Inside a custom
 * block label it sent the edit view into a render loop that pinned the server
 * and never painted; the row's data is already in hand from `useRowLabel`,
 * and an edit is one `dispatchFields`.
 *
 * A custom block label replaces Payload's whole header rather than the part of
 * it after the pill, which is why the number and the pill are redrawn here.
 * Returned as a fragment so they stay direct children of Payload's
 * `blocks-field__block-header`, which spaces them.
 */
export function BlockSummary({ fields, singular, slug }: BlockSummaryProps) {
  const { data, path, rowNumber } = useRowLabel<Record<string, unknown>>()
  const { t } = useTranslation()
  const { dispatchFields, setModified } = useForm()
  const namePath = `${path}.blockName`
  const name = typeof data?.blockName === 'string' ? data.blockName : ''
  const summary = summaryText(data, fields) || t('general:untitled')

  return (
    <>
      <span className="blocks-field__block-number">
        {String((rowNumber ?? 0) + 1).padStart(2, '0')}
      </span>
      <Pill
        className={`blocks-field__block-pill blocks-field__block-pill-${slug}`}
        pillStyle="white"
        size="small"
      >
        {singular}
      </Pill>
      {name ? (
        // `data-value` is what sizes the input — see Payload's SectionTitle.
        <div className="section-title" data-value={name}>
          <input
            aria-label={`Name for ${singular} block`}
            className="section-title__input"
            id={namePath}
            name={namePath}
            onChange={event => {
              event.stopPropagation()
              event.preventDefault()
              dispatchFields({ type: 'UPDATE', path: namePath, value: event.target.value })
              setModified(true)
            }}
            type="text"
            value={name}
          />
        </div>
      ) : (
        <span className="row-label" style={{ color: 'var(--theme-elevation-500)', pointerEvents: 'none' }}>
          {summary}
        </span>
      )}
    </>
  )
}
