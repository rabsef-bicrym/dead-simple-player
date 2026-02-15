# IPSwitch

A purpose-built IPTV player for ErsatzTV. Nothing else. No generality.

## What It Does
- Plays HLS streams from an ErsatzTV M3U playlist
- Displays EPG/guide data from ErsatzTV's XMLTV feed
- That's it. No recording, no catch-up, no VOD, no favorites, no accounts, no subscriptions, no bullshit.

## Tech Stack
- React Native with Expo (iOS + Android)
- expo-av or react-native-video for HLS playback
- Custom M3U parser (ETV format only)
- Custom XMLTV parser that actually works (handles single-line XML, Unicode, short-duration programmes)

## ErsatzTV Specifics
- M3U URL format: `http://<host>:8409/iptv/channels.m3u`
- XMLTV URL format: `http://<host>:8409/iptv/xmltv.xml`
- M3U contains `#EXTINF` lines with channel metadata, HLS stream URLs
- XMLTV may be a single enormous line (no newlines between elements)
- XMLTV contains Unicode: fullwidth punctuation (？ ： ＂), emoji (💈 🔴 ☀️), CJK characters, smart quotes, em dashes
- XMLTV has programmes as short as 0-2 seconds (must not break parser or display)
- Channel IDs format: `C<num>.<id>.ersatztv.org`
- Timezone offsets in XMLTV timestamps like `20260215070314 -0800`

## Key Requirements
1. **First-time setup**: User enters ETV server address (ip:port). App derives M3U and XMLTV URLs automatically.
2. **Channel list**: Parse M3U, show channels with names and logos
3. **Now playing**: Show what's currently on each channel from XMLTV
4. **Full-screen playback**: Tap channel → full-screen HLS stream. Swipe up/down to change channels.
5. **Guide view**: Simple EPG grid showing upcoming programmes per channel
6. **XMLTV must parse correctly**: Handle single-line XML, all Unicode, short durations, HTML entities. This is the ENTIRE reason this app exists — every other player fucks this up.

## Design
- Dark theme. Clean. No clutter.
- Channel switching should feel like TV — fast, no loading screens between channels if possible
- Guide overlay on long-press or swipe from edge during playback

## What NOT To Build
- No user accounts
- No favorites/bookmarks (maybe later)
- No recording/DVR
- No multiple playlist support (one ETV server, that's it)
- No streaming service integrations
- No ads, no analytics, no telemetry
- No splash screen with fire emoji
