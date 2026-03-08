---
sable: minor
---

Overhaul notification settings UX and fix several notification bugs.

**Bug fixes**

- Fix push notifications always being silent: `resolveSilent` in the service worker now always returns `false`, leaving sound/vibration decisions entirely to the OS and Sygnal push gateway. The in-app sound setting no longer affects push sound behaviour.
- Fix in-app notification banner not appearing on desktop. The banner was erroneously gated behind a `mobileOrTablet()` check; it now fires on all platforms when the user has In-App Notifications enabled.
- Fix in-app banner rendered as `position: fixed` in `ClientLayout` so it spans the full viewport and doesn't displace page content.
- Fix in-app banner showing "sent an encrypted message" for encrypted rooms. Events reaching the banner are already decrypted by the SDK; `isEncryptedRoom: false` is now passed so the actual message body is always shown when message content preview is enabled.
- Fix desktop OS notifications not firing when the browser window is minimised or the tab is hidden. The OS notification block now runs before the visibility guard, which only gates the in-app banner and audio.
- Fix iOS lock screen media player appearing after an in-app notification sound plays. `mediaSession.playbackState` is cleared after a short delay following `play()`. If in-app media (e.g. a video in a room) has since registered its own metadata the media session is left untouched.

**Settings page improvements**

- Move badge display settings (Show Message Counts, Direct Messages Only, Always Count Mentions) from Appearance into the Notifications page, where they belong.
- Rename "Mobile In-App Notifications" to "In-App Notifications" and show the toggle on all platforms, not just mobile.
- Rename "Notification Sound" setting to "In-App Notification Sound" to clarify it only controls the in-page audio, not push sound.
- Fix "System Notifications" description removing the incorrect claim that mobile uses the in-app banner instead.
- Add a notification levels info button (ⓘ) to the All Messages, Special Messages, and Keyword Messages section headings explaining Disable / Notify Silent / Notify Loud.
- Add descriptive text under each notification section heading.
- Collapse the two `@room` push rules into a single "Mention @room" control. On servers with MSC3952 support (`m.intentional_mentions`) it targets `IsRoomMention`; on older servers it falls back to `AtRoomNotification`. Synapse mirrors the two rules so displaying both produced an apparent sync loop where setting one immediately reset the other.
- Add a "Follows your global notification rules" subtitle to the "Default" option in the per-room notification switcher.
- Default "In-App Notifications" to off for all platforms. Users can opt in per-device in Notifications settings.
- Default "Show Message Counts" (badge numbers) to off — badges show a number only for direct mentions by default, matching Discord-style behaviour.
