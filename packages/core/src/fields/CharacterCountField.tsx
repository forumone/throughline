'use client'

import { TextareaInput, TextInput, useField } from '@payloadcms/ui'
import { mergeFieldStyles } from '@payloadcms/ui/shared'
import type { TextareaFieldClientComponent, TextFieldClientComponent } from 'payload'
import { useCallback, useEffect, useRef, useState } from 'react'

/*
A capped text field that says how much room is left, and does not let an editor
past the cap. From forumone-2026's `fields/characterCount/CharacterCount.tsx`.
`characterCountPlugin` puts it on every capped field.

**The counter appears late on purpose.** Below `SHOW_FROM` of the cap there is
none: a number under every field turns a page of fields into a page of numbers.

**The cap is enforced here, not by the browser.** `TextInput` and
`TextareaInput` take a fixed prop list without `maxLength`, so the value is cut
in `onChange`, which also catches a paste, the only way most people exceed a
limit they can see. A paste that is cut short says so.

**Content already over the cap is left alone.** It shows in full and can be
edited down; the cap only refuses additions. Payload still refuses to save it.

**The field's own styles are passed through** (`mergeFieldStyles`), or a capped
field inside a row would draw at its content's width whatever `admin.width` said.
*/

/** Fraction of the cap at which the counter appears. */
const SHOW_FROM = 0.8

/** How long "trimmed" stays up after a paste was cut. */
const TRIMMED_MS = 4000

/*
In Payload's tokens, so it follows the admin's themes. Rendered as a React 19
`<style href precedence>`, hoisted and de-duplicated however many fields show it.
*/
const CSS = `
.tl-count {
  display: flex;
  gap: var(--base, 20px);
  align-items: baseline;
  justify-content: space-between;
  margin-top: calc(var(--base, 20px) * 0.25);
  font-size: 0.8rem;
  line-height: 1.3;
  color: var(--theme-elevation-500);
}
.tl-count--full,
.tl-count__trimmed {
  color: var(--theme-warning-600, var(--theme-elevation-800));
}
.tl-count--full {
  font-weight: 600;
}
`

function useCappedValue(path: string, maxLength: number) {
  const { customComponents, setValue, value } = useField<string>({ path })
  const [trimmed, setTrimmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const onChange = useCallback(
    (event: { target: { value: string } }) => {
      const next = event.target.value

      if (next.length > maxLength) {
        setValue(next.slice(0, maxLength))
        setTrimmed(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setTrimmed(false), TRIMMED_MS)
        return
      }

      setValue(next)
    },
    [maxLength, setValue],
  )

  return {
    // A configured `afterInput`, which replacing Payload's own control would otherwise drop.
    afterInput: customComponents?.AfterInput,
    onChange,
    trimmed,
    value: typeof value === 'string' ? value : '',
  }
}

function Counter({
  length,
  maxLength,
  trimmed,
}: {
  length: number
  maxLength: number
  trimmed: boolean
}) {
  if (length < Math.floor(maxLength * SHOW_FROM)) return null

  const remaining = maxLength - length

  return (
    <div className={`tl-count${remaining <= 0 ? ' tl-count--full' : ''}`}>
      <style href="throughline-character-count" precedence="default">
        {CSS}
      </style>
      <span aria-live="polite">
        {remaining > 0
          ? `${remaining} character${remaining === 1 ? '' : 's'} left`
          : `At the ${maxLength}-character limit`}
      </span>
      {trimmed && (
        <span className="tl-count__trimmed" role="status">
          Trimmed to fit
        </span>
      )}
    </div>
  )
}

export const CharacterCountText: TextFieldClientComponent = ({ field, path }) => {
  const maxLength = field.maxLength ?? 0
  const { afterInput, onChange, trimmed, value } = useCappedValue(path, maxLength)

  return (
    <TextInput
      AfterInput={
        <>
          {afterInput}
          <Counter length={value.length} maxLength={maxLength} trimmed={trimmed} />
        </>
      }
      {...(field.admin?.description ? { description: field.admin.description } : {})}
      {...(field.label ? { label: field.label } : {})}
      onChange={onChange}
      path={path}
      required={field.required ?? false}
      style={mergeFieldStyles(field)}
      value={value}
    />
  )
}

export const CharacterCountTextarea: TextareaFieldClientComponent = ({ field, path }) => {
  const maxLength = field.maxLength ?? 0
  const { afterInput, onChange, trimmed, value } = useCappedValue(path, maxLength)

  return (
    <TextareaInput
      AfterInput={
        <>
          {afterInput}
          <Counter length={value.length} maxLength={maxLength} trimmed={trimmed} />
        </>
      }
      {...(field.admin?.description ? { description: field.admin.description } : {})}
      {...(field.label ? { label: field.label } : {})}
      onChange={onChange}
      path={path}
      required={field.required ?? false}
      style={mergeFieldStyles(field)}
      value={value}
    />
  )
}
