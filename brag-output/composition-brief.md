# Hyperframes Composition Brief: Ticker Screener

## Objective
Create a short launch-style brag video for Ticker Screener — free browser extension for live market watching.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20 seconds

## Source Material
- Project root: `C:\Users\vishw\Desktop\Misc\Antigravity Proejcts\Monetisation\Screener-Workspace`
- Primary files read: index.html, site.css, llms.txt, store-assets/ screenshots
- Product name: Ticker Screener
- Tagline / strongest claim: Your market, always in sight.
- Key UI or visual moment to recreate: scrolling ticker tape (S&P 500 / Nasdaq / Dow + watchlist, +$5.20 (+0.37%) style) + side-panel watchlist + Markets tab heatmap with native currencies
- Copy that must appear verbatim:
  - Your market, always in sight.
  - USA + 9 more — no silent conversion, ever.
  - Live ticker tape · 0.5x–3.0x · % / $ / both
  - Ticker Screener — Built for focused market watching.

Visual references (copy into composition or recreate in HTML/CSS):
- `store-assets/screenshot_v2_3_1_dashboard_1280x800.png`
- `store-assets/screenshot_v2_3_3_markets_1280x800.png`
- `store-assets/screenshot_v2_3_4_stockpopup_1280x800.png`
- `store-assets/icon_128.png` for outro logo
- Colors: bg #07131f, text #eaf4ff, muted #9aadbf, accent mint #81f4c6, cyan #4ed7ff, blue #3679ff
- Font: Manrope (Google Fonts, fallback Segoe UI sans-serif)

## Creative Direction
- Tone preset: polished
- Creative direction: quiet premium market command center film
- Interpretation: Slow reveals, long holds, soft crossfades 0.6-0.8s. Light-to-medium type, generous letter-spacing. Confidence through restraint.
- Angle: Wall Street follows you around — not a dashboard you visit, but a market layer on top of the web. Relief from scattered tabs.
- Hook: Full navy + mint glow, “Your market, always in sight.” + ● LIVE WATCHLIST chip, first 3s
- Outro / punchline: Logo + Built for focused market watching + Get the extension — Chrome & Firefox, bell ring, hold
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign
  - ALL CAPS hype, chaotic cuts, glitch SFX

## Visual Identity
- Background: #07131f
- Text: #eaf4ff
- Accent: #81f4c6 (secondary #4ed7ff)
- Display font: Manrope 800
- Body font: Manrope 400/500
- Visual references from the project: aurora gradient (cyan 18% / mint 13%), product-frame with LIVE MARKET VIEW badge, ticker-chip, feature cards with mint icon tiles

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Hook — 3s — navy + aurora, eyebrow V2.5.1, headline Your market always in sight, LIVE WATCHLIST chip
2. Reveal — 5s — scrolling tape + Ctrl+Shift+S side panel with 3 watchlist rows arriving one by one
3. Highlights — 6s — Markets tab heatmap + gainers/losers + macro tiles + $ ₹ ¥ £ € tags
4. Outro — 6s — icon + Ticker Screener + Built for focused market watching + Get extension CTA

Total 20s. Every readable line holds: short label 0.8s settled, sentence 0.3s/word min 1.2s.

## Audio
- Audio role: warm bed, sparse professional accents
- Audio arc: bed establishes → steady momentum → confident peak → resolve + bell + fade
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (Steady and clean, polished/cinematic)
- Music treatment: 0.32 volume, 0.8s fade-in, duck to 0.13 during voiceover, return after, fade-out last 1.5s
- Music cue guidance: bundled preset `assets/music/cues/happy-beats-business-moves-vol-12.music-cues.md/json` if available, else detect at composition via `analyze_music_cues.py` or `npx hyperframes beats`; 2 strong-cue locks max (hero ~3s, logo ~17.5s ±0.15s); sequential tags snap to beats ±0.10s with readability hold
- Audio-reactive treatment: subtle; RMS/bass breathe hero glow and card presence, no waveform/equalizer visuals
- Audio-coupled moments:
  - Scene 1 hook fade-up — soft drop
  - Scene 2 rows arriving — gentle ticks + keypress for Ctrl+Shift+S
  - Scene 4 logo — impactBell_heavy_000, ring over fade
- SFX selection guidance: sparse, motion-matched; card sounds for rows, announcement cue for heatmap payoff, click for simulated keys, restraint when busy
- SFX analysis guidance: `skills/brag/assets/sfx/sfx-analysis.md/json` if present; prefer low HF-risk for polished/repeated moments
- Exact SFX choice: Hyperframes should choose filenames, timestamps, density, volume based on implemented animation
- Audio files: copy chosen music + SFX + voiceover.wav into `brag-output/composition/assets/`
- Voiceover: `composition/assets/voiceover.wav` via `npx hyperframes tts` with Kokoro af_heart, track-index 3, volume 1.0, music ducks 0.12-0.15 during VO. Flex scene durations to WAV length. Script in brag-plan.md ## Voiceover script.

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core` (composition contract + `data-*` timing), `hyperframes-animation` (motion), `hyperframes-creative` (design spec, beats, audio-reactive), `hyperframes-keyframes` (seek-safe keyframes), and `hyperframes-cli` (lint/check/render). /brag is its own workflow: do not enter the `hyperframes` entry-point intent interview and do not route into its generic promo / launch-video workflow. Prefer native Hyperframes conventions over anything in `/brag`.

Requirements:
- Show at least one real UI, copy, or visual element from the source project.
- Keep all text readable in the final render.
- Keep the video within 15-25 seconds.
- Include the planned music/SFX + voiceover layer.
- Treat `/brag` audio notes as guidance, not a fixed cue sheet. Choose SFX after visual animation exists.
- Treat music cue metadata as optional timing hints. Hyperframes decides exact animation timing and should ignore cues that hurt readability, scene pacing, or product story.
- Major reveals may move toward nearby strong cues within about 0.15s. Smaller entrances may align to nearby beat points within about 0.10s. Use only 1-3 strong cue locks in a 15-25s video unless edit clearly benefits from more.
- Use SFX to support motion and interaction.
- Honor planned music treatment such as fade-outs, ducking, beat-aligned reveals, or letting final SFX ring over music.
- When music is present consider audio-reactive: extract audio data and use RMS/frequency for subtle glow/presence. Avoid waveform/equalizer, notes, particles, strobing.
- Use local assets for audio and runtime/media deps when possible.
- Run `hyperframes check` before render — it is brag's single gate.
