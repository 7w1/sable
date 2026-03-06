---
sable: patch
---

Fix notifications on older sliding sync proxies (e.g. Flatpak)

`MessageNotifications` and `InviteNotifications` in `ClientNonUIFeatures.tsx`:

**No notifications on older sliding sync proxies (e.g. Flatpak packages
using matrix-sliding-sync)** — The matrix-sliding-sync proxy and similar
older implementations omit `num_live` from their response. The SDK
interprets this as `numLive=0`, making every event arrive with
`fromCache=true` and `liveEvent=false`, which filtered out every message.
Fixed with a timestamp-based fallback: when `liveEvent` is false, the event
is only treated as historical if it was sent more than 60 seconds before
this component mounted **and** the user already has a read receipt covering
it. Events that arrive after mount are treated as potentially live and go
through the normal notification pipeline. Servers with proper `num_live`
support are unaffected. Also wrapped `window.Notification` calls in
`try/catch` to absorb errors in sandboxed environments where the API may be
restricted (e.g. Flatpak).
