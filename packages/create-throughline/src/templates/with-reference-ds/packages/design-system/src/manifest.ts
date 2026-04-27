// Re-export the reference DS manifest so payload.config.ts can import
// it from a single workspace path. Replace this with your own manifest
// import when you stop using the reference DS.
import manifest from '@forumone/throughline-reference-ds/manifest' with { type: 'json' }

export default manifest
