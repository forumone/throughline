#!/usr/bin/env node
// Placeholder; real entry arrives in C13.2.
async function main(): Promise<void> {
  process.stdout.write('create-throughline: not yet implemented\n')
  process.exit(1)
}

main().catch((error: unknown) => {
  process.stderr.write(`Unexpected error: ${String(error)}\n`)
  process.exit(1)
})
