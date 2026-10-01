// Ambient module shim for `next/cache`. Next.js does not declare a `./cache`
// entry in its package.json `exports` map, which means TypeScript under
// `module: NodeNext` cannot resolve `import('next/cache')` even though the
// runtime resolves it fine. Declaring the module's surface here lets the
// dynamic import in `next-revalidate.ts` typecheck without forcing a hard
// dependency on Next.js for non-Next.js consumers.
//
// `revalidateTag` is declared with Next 16's two-argument signature. Next 15
// takes one and ignores a second, so calling it this way is correct on both.
declare module 'next/cache' {
  export function revalidatePath(path: string, type?: 'layout' | 'page'): void
  export function revalidateTag(tag: string, profile: string | { expire?: number }): void
}
