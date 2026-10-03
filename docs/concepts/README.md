# Concepts

Explanations. Why the system is shaped this way, what the tradeoffs are, what mental model to bring when you read the code.

These pages don't tell you how to do anything. They tell you what's happening so the *how* docs make sense.

- **[Architecture overview](architecture-overview.md)** — the one-page mental model. Read this first.
- **[Plugin composition](plugin-composition.md)** — every part of Throughline is a Payload plugin; how `throughline()` composes them and why order matters.
- **[The trust boundary](the-trust-boundary.md)** — why the publishing pipeline is the only sanctioned path to "published," and what that buys you.
- **[Design system contracts](design-system-contracts.md)** — the manifest, the rules engine, why Claude needs a contract instead of just a component list.
- **[Event-driven workflows](event-driven-workflows.md)** — why plugins fire events instead of calling each other, and the jobs that run on Inngest or Payload Jobs.
- **[Client-agnostic core](client-agnostic-core.md)** — the two-track architecture. What goes in core, what stays in your client project.
