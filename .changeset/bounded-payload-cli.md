---
'@forumone/throughline-core': minor
---

A `throughline-payload` bin: the Payload CLI, run so a hung command cannot outlive the shell that started it. pnpm does not forward signals to the node process it spawns, so a killed shell left `payload generate:types` running, and a hung one spinning on a core indefinitely.

- Payload runs in its own process group; SIGINT, SIGTERM and SIGHUP are forwarded to the group, then SIGKILL after `PAYLOAD_CLI_GRACE_MS` (default 5s)
- a wall clock, `PAYLOAD_CLI_TIMEOUT_MS` (default 5 minutes, `0` disables; none by default for `migrate*`), exits 124
- each run is recorded in `.payload-cli-pids` at the workspace root, and the next run — or `throughline-payload --reap` — kills a recorded group whose runner was killed, after checking its pid, start time and command line
