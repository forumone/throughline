/*
Stylesheet imports, answered with a stand-in.

An args file imports its component for the types, and a component imports its
stylesheet — `import styles from './card.module.css'` — so loading an args file
in Node reaches a `.css` file, which Node cannot load, and the whole check
stops on a file it never needed. What this compares is the shape of the args,
not anything a stylesheet holds.

So each stylesheet becomes a module whose default export answers any class
name with that name, the way a CSS module does at runtime, and which has
nothing else in it. Registered from `check-block-props.mjs` after tsx, so it
runs before tsx's own hook.
*/

const STYLESHEET = /\.(css|scss|sass|less)$/

export async function load(url, context, nextLoad) {
  if (STYLESHEET.test(new URL(url).pathname)) {
    return {
      format: 'module',
      shortCircuit: true,
      source:
        "export default new Proxy({}, { get: (_, key) => (typeof key === 'string' ? key : undefined) })\n",
    }
  }
  return nextLoad(url, context)
}
