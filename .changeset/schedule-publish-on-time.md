---
'@forumone/throughline-publishing': minor
'@forumone/throughline-workflows': minor
---

Scheduled publishing works from the admin, publishes on time, and cleans up after itself.

A schedule set from the admin never published. It was written by a draft save,
Payload keeps a draft save in the versions table only, and the cron read the main
row — so only a schedule written over MCP, by a non-draft update, was ever found.

- **publishing**: a Schedule control replaces the scheduled-publish date field on
  any collection that declares one, and runs the pipeline's checks when a time is
  picked. An approval not yet granted, or an embargo that ends first, schedules
  with a warning rather than refusing. `schedule` and `unschedule` admin
  endpoints, `PublishingService.schedule` / `.unschedule`, and
  `scheduleDocument` / `unscheduleDocument`; `schedule_publish` now calls the
  service and writes the time as a draft. An `afterChange` hook sends
  `content/page.scheduled` whenever the time changes, whichever route set it.
  Publishing and unpublishing clear the time, so an unpublished page can no longer
  put itself back up.
- **workflows**: `createPublishAtScheduledTimeFunction` sleeps until the scheduled
  time instead of polling, in six-day hops for schedules further out.
  `createExecuteScheduledPublishesFunction` reads the latest version
  (`draft: true`) and takes `overdueByMs`, for running it as a backstop.
