## [Branding & Release Prep] - {PR_MERGE_DATE}
- Rename extension branding to `Liner Notes`.
- Update package slug to `liner-notes`.
- Refresh store screenshots and align metadata image names with the new slug.
- Prepare release metadata and assets for `v1.0.1`.

## [Feature Additions] - 2026-02-25
- Added automatic lyric search based on media currently playing (requires `media-control` library).
- Added AI lyric interpretation.
- Added prompt management interface.
- Added a new `Now Playing Menu Bar Item` command.
- Added menu bar quick actions for current track lyrics, artist info, and album info.
- Added album artwork support in the menu bar with a user on/off preference.
- Added customizable menu bar title templates with variables: `{track}`, `{artist}`, and `{album}`.
- Added caching/sticky now-playing behavior so ineligible media does not clear the last eligible menu bar item.
