# Sable Client Changelog

## 1.3.0 - 3/2/2026

- Mobile push notifications! ([#44](https://github.com/7w1/sable/issues/44), [#49](https://github.com/7w1/sable/pull/49)) - [Evie Gauthier](https://github.com/Just-Insane)
- Beta Simplified Sliding Sync support ([#67](https://github.com/7w1/sable/pull/67), ([#75](https://github.com/7w1/sable/pull/75)) - [Evie Gauthier](https://github.com/Just-Insane)
- Codebase cleanups, CI improvements, and docker builds ([#26](https://github.com/7w1/sable/pull/26), [#35](https://github.com/7w1/sable/pull/35), [#62](https://github.com/7w1/sable/pull/62), [#64](https://github.com/7w1/sable/pull/64), [#65](https://github.com/7w1/sable/pull/65)) - [haz](https://github.com/hazre)
- Add room/space specific pronouns, when enabled by room/space admin. ([#30](https://github.com/7w1/sable/issues/30))
- Add validation to timezones before rendering.
- Fix invalid matrix.to event link generation ([cinnyapp#2717](https://github.com/cinnyapp/cinny/pull/2717)) - [tulir](https://github.com/tulir)
- Fix Call Rooms' chat button ([#58](https://github.com/7w1/sable/pull/58)) - [Rosy-iso](https://github.com/Rosy-iso)
- Strip quotes for mxc urls converted to http for tuwunel ([#56](https://github.com/7w1/sable/pull/56)) - [Rosy-iso](https://github.com/Rosy-iso)
- Add Sable space and announcements room to featured communities.
- Unobfusticate css in production builds.

## 1.2.3 - 3/2/2026

- Actually fix quotes around colors for tuwunel homeservers ([#46](https://github.com/7w1/sable/issues/46))
- Option to have your own message bubbles in bubble layout right aligned ([#38](https://github.com/7w1/sable/issues/38))
- Allow responding to and rendering replies with files ([#54](https://github.com/7w1/sable/pull/54)) - [nushea](https://github.com/nushea)
- Added Gruvbox theme ([#51](https://github.com/7w1/sable/pull/51)) - [dollth.ing](https://github.com/dollth-ing)

## 1.2.2 v2

- hotfix for stupid firefox cors crash

## 1.2.2 - 3/1/2026

- Fixed/updated unknown extended profile keys rendering.
- Added support for `---`, `-#`, and fixed `-` to be unordered.
- Fix quotes around colors for tuwunel homeservers ([#46](https://github.com/7w1/sable/issues/46))
- Added Rosé Pine theme ([#41](https://github.com/7w1/sable/pull/41)) - [wrigglebug](https://github.com/wrigglebug)
- Add back default Cinny Dark theme.
- Merge time formatting improvements from ([cinnyapp#2710](https://github.com/cinnyapp/cinny/pull/2710)) - [nushea](https://github.com/nushea)
- Merge Uniform avatar appearance in space/room navigation from ([cinnyapp#2713](https://github.com/cinnyapp/cinny/pull/2713)) - [wolterkam](https://github.com/wolterkam)
- Merge Streamline the confusing DM invite user experience from ([cinnyapp#2709](https://github.com/cinnyapp/cinny/pull/2709)) - [wolterkam](https://github.com/wolterkam)

## 1.2.1

- Update pronouns to match [MSC4247](https://github.com/matrix-org/matrix-spec-proposals/pull/4247) format better and support up to 3 pronoun pills on desktop, 1 on mobile ([#23](https://github.com/7w1/sable/issues/23), [#33](https://github.com/7w1/sable/pull/33)) - [ranidspace](https://github.com/ranidspace)
  - Unfortunately, **everyone who set pronouns in Sable will need to reset them.**
- Fix jumbo-ified non-emojis with colons. ([#32](https://github.com/7w1/sable/issues/32))
- Show full timestamps on hover. ([cinnyapp#2699](https://github.com/cinnyapp/cinny/issues/2699))
- Enable Twitter-style emojis by default.
- Make inline editor buttons buttons.
- Name colors in pinned messages.
- Rename "Heating up" to "Petting cats"
- Concurrency guard for profile lookups.
- Hex color input for power level editor.
- Editing previous messages with keybinds no longer breaks message bar ([#36](https://github.com/7w1/sable/issues/36))

## 1.2.0

- Codebase cleanup ([#22](https://github.com/7w1/sable/pull/22)) - [haz](https://github.com/hazre)
- Fix mono font ([#18](https://github.com/7w1/sable/pull/18)) - [Alexia](https://github.com/cyrneko)
- Merge final commits from ([cinnyapp#2599](https://github.com/cinnyapp/cinny/pull/2599))
- Unread pin counter & highlighting ([#25](https://github.com/7w1/sable/pull/25), [#31](https://github.com/7w1/sable/pull/31))

## 1.1.7

- Fix delete and report button colors.
- Fix modal backgrounds missing in some menus.
- Reply is now a toggle. When you click/swipe to reply to the message you're already replying to, it's reset.
- Option to hide member events in read-only rooms, like announcement channels, so you can actually read them. Enabled by default.
- Improvements to image and pdf viewers. Touch pan/zoom, scroll wheel zoom, and better reponsiveness.
- Fixed gestures occasionally triggering inside image and pdf viewer.

## 1.1.6

- Fix crash if too many emojis present [cinnyapp#2570](https://github.com/cinnyapp/cinny/issues/2570)

## Version 1.1.5

- Various performance improvements. See commits for details.
- Fix typing indicator z index on mobile.
- Fix room nicknames not displaying.
- Fix rare crash with colorMXID [(#15)](https://github.com/7w1/sable/pull/15)
- Fix crash from long pronoun pills [(#16)](https://github.com/7w1/sable/pull/16)

## Version 1.1.4

- Various performance improvements
- Fix bio editor crashing when faced with commet bio format.

## Version 1.1.3

_skipped a number since lots of updates :3_

- Profile banners. Support's Commet's format.
- Global name colors. Can be disabled in settings.
- Even more refractoring to improve timeline & user profile speeds and caches and fix that stupid bug.
  - probably introduced more bugs tbh, but things should be faster and less intense on resources?
- Pinned messages actually jump to the damn pins instead of somewhere vaguely nearby half the time.
  - that is... if they've been seen before. otherwise it just gives up sadly.
- Mobile context menu is opened by double tapping on a message instead of holding.
- ~~Fixed bio editor formatting.~~ This was a lie.
- Properly clear user data when account settings are updated.

## Version 1.1.1

- More cache fixes and improvements.
- Fix flash of extra info when click on profiles sometimes.
- Added minimum width for widgit drawer.

## Version 1.1.0

- Global profile cache & automatic cache clearing on member update events along with other improvements.
- Fix unexpected bio field formats.
- Widgets support.
- (potentially) fixed rare crash when ~~changing rooms~~ existing. please...

## Version 1.0.1

- (potentially) fixed rare crash when changing rooms
- Support Commet bios.
- Raise bio limit to 1024 characters.
- Account switcher toggle in config.json.

## Version 1.0.0

- Releases provided in releases tab. Versions for Windows & Linux built via electron.
- Account switcher made by TastelessVoid. PR #1
- Gestures for mobile.
- Notifications jump to location instead of inbox.
- Merged voice & video calls from Cinny PR #2599.
- Client-side previews for some image and video formats.
  - Will attempt to preview all image/video links in a message, if there are none, it generates a standard preview, forwarding the request to the homeserver.
  - Bug fix for images/links/anything that loads after room is opened, properly shifting the scroll to the bottom.
- Client-side nicknames for other users. PR #3
- Inline editor for editing messages.
- Pronouns, bios, and timezones.
- Pressing send on mobile no longer closes keyboard.
  - Pressing enter on mobile will always provide a newline, ignores the setting for desktop.
- More reactive UI (literally just buttons shifting up and shrinking on click)
- Added name colors and fonts to the member list sidebar.
- Added a reset button to the room name input box for dms.
  - Reset's the dm room name to the name of the other user (on both ends).
  - Same as saving a blank room name.
- New UI colors & fonts.
- Pronoun pills.
- Updated legacy colors (aka random name colors) to no longer be legacy and now be pretty.
- Fixed background & header for PWA on iOS devices.
- Lighten on currently hovered message.
- Privacy blur options in Appearance tab in user settings.
- Jumbo emoji size selector in Appearance tab in user settings.
- Added Cosmetics tab to room and space settings.
- New cosmetic commands, requires power level 50. Permission located in Cosmetics tab.
  - /color #ffffff -> change your name color for a room
  - /gcolor #111111 -> change your name color for a space
  - /font monospace -> change your name font for a room
  - /font Courier New -> change your name font for a space
- Hierarchies
  - Room Color > Space Color > Role Color > Default
  - Room Font > Space Font > Default
    - _Note, if the room font is invaild it will fallback directly to default, not the space font._
- Includes all features in Cinny v4.10.5
