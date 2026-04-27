# @forumone/throughline-email

## 0.2.1

### Patch Changes

- Updated dependencies [a4b5108]
  - @forumone/throughline-core@0.2.1

## 0.2.0

### Minor Changes

- fab82fc: Initial release of the email package. Pairs Resend with React Email templates and ships the three notification Inngest functions that close the approval workflow loop. Templates: `ApprovalRequestEmail` (preview + Approve / Request changes / Discuss), `ApprovalDecisionEmail` (granted / declined / changes-requested variants with decision-aware next-step copy), `ApprovalExpiredEmail`. All render to HTML and plaintext from the same React tree. Functions: `createNotifyApprovalRequestFunction` (subscribes to `notification/send-approval-request`, sends per approver in `notifiedApprovers` with each in its own `step.run`), `createNotifyApprovalDecisionFunction` (subscribes to `notification/send-approval-decision`), `createNotifyApprovalExpiredFunction` (subscribes to `approval/expired`). Themed via `EmailBrandTokens` (neutral defaults; brand name lands in header / From name / footer for consistency). Plugin exposes the client and functions via Symbols (`getEmailClient`, `getEmailFunctions`) for the client app's Inngest endpoint to compose. Throws at init if `RESEND_API_KEY` / `EMAIL_FROM_ADDRESS` / `resolveApprover` / `resolveRequester` / `buildActionUrl` are missing.
