/**
 * A tool's refusal, in the shape every tool in the suite already returns.
 *
 * Three identical copies of this existed, one per server that has an access
 * predicate. A refusal is a *result*, not an exception: the MCP handler turns a
 * thrown error into a JSON-RPC error with no room for a reason a caller can act
 * on, and an agent reading `{ error: … }` can tell the user what happened.
 *
 * The role predicates stay with their servers. What counts as an audit reader is
 * not what counts as a forms author, and collapsing them would put one package's
 * policy in another's file.
 */
export function deniedEnvelope(reason: string): { error: string } {
  return { error: reason }
}
