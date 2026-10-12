import type { RichTextField } from 'payload'

/**
 * The hand-authored half of the bridge.
 *
 * A design-system contract describes a *content model* — what an author writes.
 * A React component has a *prop model* — what it renders from. They are the
 * same thing 99 times out of 100, which is what makes generation worth doing,
 * and the exceptions are few enough to enumerate. This is where they are
 * enumerated, once, for both the generator and the renderer: a field renamed
 * here is renamed in the Payload schema *and* in what gets passed to the
 * component, so the two can never disagree.
 */

/** Where a contract's field type is not the whole story. */
export interface FieldOverride {
  /**
   * Leave the field out of the CMS entirely.
   *
   * For fields that model runtime state rather than authored content — a
   * form's `status`, say, which is the host's business and changes several
   * times a minute. An author cannot usefully set it and a stored value would
   * be wrong the moment it was read.
   */
  omit?: true
  /**
   * The prop name to pass this field as, when it differs from the field name.
   * `ArticleBody` is the only case today: its contract calls the body `body`
   * and the component takes it as `children`.
   */
  propName?: string
  /**
   * Force a treatment the contract's `type` cannot express.
   *
   * `videoUpload` is for a video the site hosts itself rather than embeds. The
   * contract's `video` type means a provider URL — it is `VideoEmbed`'s
   * YouTube/Vimeo/Wistia iframe src — and the field type enum in
   * `@forumone/throughline-design-system/contract` has no eleventh value for "a file
   * in the media library". So the contract says `video`, and this says which
   * of the two kinds of video it meant: an upload field, resolved to the
   * stored file's URL with no `srcSet` beside it, because a video has no
   * candidate widths to choose between.
   */
  as?: 'icon' | 'url' | 'videoUpload'
  /**
   * Explicit `select` options. The manifest carries none — allowed values live
   * in prose `constraints` — so they come from the component's own literal
   * union type where one exists, and from here where it does not.
   */
  options?: readonly string[]
  /**
   * The editor a `richtext` field uses, in place of the config's default.
   *
   * A generated rich-text field otherwise takes whatever `editor` the Payload
   * config sets, which a host keeps to the stock feature set for good reason:
   * the default reaches every rich-text field in the build, including ones
   * nested in the very blocks a richer editor would offer, and that cycle is a
   * stack overflow in type generation. So a host builds its richer editor once
   * — images with a width and a caption, pull quotes, a callout — and names the
   * fields that get it. `ArticleBody.body` is the case it was added for: an
   * article body inside a block is still an article body (forumone-2026#813).
   *
   * Only a `richtext` field takes one. Set on anything else, the generator
   * throws rather than ignoring it.
   */
  editor?: RichTextField['editor']
}

export interface ComponentOverride {
  /**
   * Keep the component out of the block palette.
   *
   * For components that are real parts of a page but not authorable as blocks:
   * site chrome a template renders (`Header`, `Footer`, `Skiplink`), and
   * anything whose props are supplied by the document rather than by a block
   * author.
   */
  notABlock?: true
  /**
   * The block's name in the picker, when splitting the component name reads
   * wrong: `AtAGlance` humanizes to "At AGlance". The slug is unchanged — it
   * is the manifest name, byte for byte, whatever the label says.
   */
  label?: string
  /** Keyed by field path — `heading`, `items.title`, `image.src`. */
  fields?: Record<string, FieldOverride>
}

export type Overrides = Record<string, ComponentOverride>

/** Look an override up by component and dotted field path. */
export function fieldOverride(
  overrides: Overrides,
  component: string,
  path: string,
): FieldOverride | undefined {
  return overrides[component]?.fields?.[path]
}
