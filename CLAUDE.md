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

### Server Access
- **ErsatzTV host (docker, current):** `192.168.50.188` (drive box; container `ersatztv`)
- **Old NUC host (historical):** `ssh -i ~/.ssh/talwet rabsef-bicrym@192.168.50.150`
- **Tailscale IP:** `100.85.152.35`
- **ETV API port:** `8409`
- **M3U URL:** `http://<host>:8409/iptv/channels.m3u`
- **XMLTV URL:** `http://<host>:8409/iptv/xmltv.xml`
- **ETV API:** `http://<host>:8409/api/channels` (JSON list of channels)

### To get real test data for parser development:
```bash
# Fetch M3U
ssh -i ~/.ssh/talwet rabsef-bicrym@192.168.50.150 "curl -s http://localhost:8409/iptv/channels.m3u" > test_data/channels.m3u

# Fetch XMLTV
ssh -i ~/.ssh/talwet rabsef-bicrym@192.168.50.150 "curl -s http://localhost:8409/iptv/xmltv.xml" > test_data/xmltv.xml
```

### Current channels (as of 2026-07-18):
| Ch# | Name | Channel ID |
|-----|------|-----------|
| 1 | The Prisoner | C1.145.ersatztv.org |
| 2 | Nana's Picks | C2.146.ersatztv.org |
| 3 | Television | C3.147.ersatztv.org |
| 4 | Movies | C4.148.ersatztv.org |
| 5 | Oddities | C5.149.ersatztv.org |
| 6 | Music | C6.150.ersatztv.org |

### Streaming mode (as of 2026-07-18)
All channels serve **HLS Segmenter** — stream URLs in the M3U are
`/iptv/channel/N.m3u8?mode=segmenter` (formerly `/iptv/channel/N.ts`).
Parsers and the player must accept the `.m3u8` + query-string form.
This change fixed the long-standing 10-20s stall problem (MPEG-TS gave
clients zero buffer slack against encoder hiccups at item boundaries).

### XMLTV Format Issues (THE reason this app exists)
Every other IPTV player fails at parsing ErsatzTV's XMLTV. Here's what you MUST handle:

1. **Single-line XML:** The entire XMLTV is one enormous line (~3MB as of 2026-07: every file now has a rich NFO). No newlines between `<programme>` elements. Your parser MUST NOT assume line-delimited XML.

2. **Unicode in titles and descriptions:**
   - Fullwidth punctuation: ？(U+FF1F) ：(U+FF1A) ＂(U+FF02)
   - Smart quotes: ' " " (U+2019, U+201C, U+201D)
   - Em/en dashes: — – ‑ (U+2014, U+2013, U+2011)
   - Emoji: 💈 🔴 ☀️ (supplementary plane + variation selectors)
   - CJK characters: 瑞士默劇團
   - Fraction slash: ⧸ (U+29F8)
   - Accented Latin: É Í á ä å è é ë ó ö

3. **HTML entities:** `&#39;` `&quot;` `&#232;` `&#233;` `&#215;` `&#128136;` `&#128308;` `&amp;`

4. **Tiny-duration programmes:** Some entries are 0-2 seconds long (e.g., "Race Horse" at 1s, "Roundhay Garden Scene" at 2s). These are real content. Don't skip them, but don't let them break layout either — collapse or group them visually.

5. **Timezone offsets:** Timestamps like `20260215070314 -0800`. Parse the offset correctly.

6. **No icons on some channels:** C1 (The Prisoner) has no `<icon>` elements in programme entries. Handle gracefully.

## Key Requirements
1. **First-time setup**: User enters ETV server address (ip:port). App derives M3U and XMLTV URLs automatically.
2. **Channel list**: Parse M3U, show channels with names and logos
3. **Now playing**: Show what's currently on each channel from XMLTV
4. **Full-screen playback**: Tap channel → full-screen HLS stream. Swipe up/down to change channels.
5. **Guide view**: Simple EPG grid showing upcoming programmes per channel
6. **XMLTV must parse correctly**: This is the ENTIRE reason this app exists.

## Design
- Dark theme. Clean. No clutter.
- Channel switching should feel like TV — fast, no loading screens
- Guide overlay on long-press or swipe from edge during playback

## What NOT To Build
- No user accounts
- No favorites/bookmarks
- No recording/DVR
- No multiple playlist support (one ETV server)
- No streaming service integrations
- No ads, no analytics, no telemetry
- No splash screen with fire emoji

## Testing
Fetch real data from the NUC and save to `test_data/` directory. Write parser tests against the real XMLTV. If the parser can't handle the real file, it's broken.
