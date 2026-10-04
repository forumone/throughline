---
'@forumone/throughline': patch
---

`trigger_sync`'s description now says what the tool does: it runs a real sync, the same as the admin's "Sync now" button. It used to say the tool "sends a test payload", which could lead an agent to start a live sync while thinking it was only checking connectivity. It now points to `test_integration` for that.
