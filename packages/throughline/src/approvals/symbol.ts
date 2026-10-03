/**
 * Where the approvals plugin attaches its resolver on the Payload instance,
 * and where publishing's approval step looks for it when its own
 * `approvalResolver` option is not set. That lookup is what lets a site add
 * the approvals plugin without re-configuring publishing.
 *
 * One module, imported by both. Each side used to declare its own copy, kept in
 * step by a comment, while they shipped as separate packages. Internal: a site
 * never needs it.
 */
export const APPROVALS_RESOLVER_SYMBOL = Symbol.for('@forumone/throughline/approvals-resolver')
