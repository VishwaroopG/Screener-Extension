# Brag Plan: Ticker Screener

## What is this app?
Ticker Screener is a free Chrome/Firefox extension that turns every browser tab into a live market workspace — NYSE/Nasdaq watchlist, S&P 500 / Nasdaq / Dow ticker tape, plus a 10-economy Markets tab.

## The angle
Wall Street follows you around. Not a dashboard you visit — a market layer that lives on top of the web you already browse. Quiet, premium, always-on. The joke isn't absurdity, it's relief: no more 27 scattered Yahoo tabs.

## Hook (first 2-3 seconds)
Full-screen navy `#07131f` with mint glow. One line fades up:
“Your market, always in sight.”
Small eyebrow above: `v2.5.1 · S&P 500 · NASDAQ · DOW`. Ticker-chip `● LIVE WATCHLIST` pulses in. No clutter — earn the next 17 seconds with confidence.

## Key moments (the middle)
- Live ticker tape scrolling on any page — pause, 0.5x to 3.0x, % / $ / both like +$5.20 (+0.37%). Real copy from site.
- Side panel watchlist: Ctrl+Shift+S opens it — price, day change, sparklines, P/E, AI verdicts, price alerts.
- Markets tab: opens on USA, switch to 9 more — UK, India, Singapore, Japan, Hong Kong, Germany, France, Australia, Canada. Heatmap + strictly separated gainers/losers + World Bank macro tiles. Native currencies: $ ₹ ¥ £ € S$ HK$ A$ C$. “No silent conversion, ever.”

## Outro / punchline
Ticker Screener logo mark + “Ticker Screener — Built for focused market watching.” CTA: “Get the extension — Chrome & Firefox.” Hold on mint gradient button. Silence + soft bell.

## User flow worth showing
Entry → Key action → Result:
- Press Ctrl+Shift+S anywhere → side panel slides in with live NYSE/Nasdaq watchlist
- Tape scrolls on top of a normal webpage, hover a ticker → detail popup with 1M–MAX chart
- Jump to Markets tab → USA heatmap → switch to India/Japan → macro tiles + native currency prices

## Tone
- Preset: polished
- Creative direction: quiet premium market command center film
- Interpretation: Slow reveals, generous holds, light-to-medium Manrope, soft crossfades. Confidence through restraint. Let real UI do the talking. No hype caps, no jokes.

## Format: landscape — 1920x1080
## Duration: 20 seconds

## Visual identity (from the project)
- Background: #07131f (navy, with aurora radial #0a1b29)
- Accent: #81f4c6 (mint) + #4ed7ff (cyan) + gradient button mint→#59dffc
- Text: #eaf4ff, muted #9aadbf
- Display font: Manrope 800
- Body font: Manrope 400/500
- Strongest visual element: product-frame with LIVE MARKET VIEW badge + ticker-chip ● LIVE WATCHLIST + scrolling tape + index heatmap green/red

Source screenshots to recreate/reference (in `store-assets/`):
- `screenshot_v2_3_1_dashboard_1280x800.png` — main workspace
- `screenshot_v2_3_3_markets_1280x800.png` — Markets tab heatmap
- `screenshot_v2_3_4_stockpopup_1280x800.png` — ticker detail popup + chart
- `promo_marquee_1400x560.jpg` — hero live view

## Share copy (draft)
Introducing Ticker Screener: your market, always in sight. Live NYSE/Nasdaq watchlist, S&P tape, and 10 global markets — inside every browser tab.

## Audio direction
- Role: warm bed, sparse professional accents
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` — Steady and clean, 1:58 — best for polished/cinematic
- Music treatment: start at 0s at 0.32 volume, soft fade-in 0.8s, duck to 0.13 during voiceover, return to 0.32 after, fade-out last 1.5s
- Music cue guidance: bundled preset `skills/brag/assets/music/cues/happy-beats-business-moves-vol-12.music-cues.md` if present, otherwise to be detected at composition time via `npx hyperframes beats`. Target 2 strong-cue locks: hero reveal ~3.0s, final logo ~17.5s. Beat-grid windows for Scene 3 stat sequence.
- Audio-reactive treatment: subtle; use music RMS/bass to breathe hero glow and product card presence, no waveform/equalizer visuals
- SFX posture: sparse, motion-matched, professional restraint — 2-3 cues max
- Audio-coupled moments:
  - Scene 1 hook line fade-up — soft drop
  - Scene 2 tape cards arriving — gentle tick
  - Scene 4 logo landing — deep bell `impactBell_heavy_000`, let ring over music fade
- Restraint rule: music and SFX must never fight voiceover. No glitch, no punch, no casino excess.

## Voiceover script
Voice: Kokoro `af_heart`, conversational, calm. Complements visuals, does not read on-screen text verbatim.

- Scene 1 (0-3s): “Every tab you open already knows the market.”
- Scene 2 (3-8s): “A live watchlist and tape, right inside your browser.”
- Scene 3 (8-14s): “Ten economies, native currencies, real context.”
- Scene 4 (14-20s): “Ticker Screener. Your market, always in sight.”

Total ~23 words, paced to 20s with pauses. Generate via `npx hyperframes tts` to `composition/assets/voiceover.wav`, flex scene holds to match WAV.

## Storyboard

### Scene 1 — Hook — 3s
Navy #07131f with cyan/mint aurora glow. Eyebrow `V2.5.1 · S&P 500 · NASDAQ · DOW` then headline “Your market, always in sight.” with “always in sight.” in mint #81f4c6. Ticker-chip `● LIVE WATCHLIST` fades in bottom. Manrope 800, generous spacing.
Sequential/interaction: none — single slow fade-up
Audio intent: warm bed establishes, quiet anticipation
Audio-coupled idea: soft label pop with `interface/drop_001` if used
Music: vol-12 steady bed at 0.32
Transition mood: soft crossfade (0.6s) → Scene 2

### Scene 2 — Reveal — tape + side panel — 5s
Recreate tape: dark strip with `AAPL +$5.20 (+0.37%) · SPX · NDX · DJI` scrolling left, controls hint `0.5x–3.0x · pause`. Simulate Ctrl+Shift+S — side panel slides in from right with 3 watchlist rows (price, green/red change, sparkline). Real copy: “Live ticker tape”, “Pause, speed, % / $”.
Sequential/interaction: yes — tape starts, then 3 watchlist rows arrive one by one (0.6s apart, hold full set 2s for readability)
Audio intent: bed continues, professional momentum
Audio-coupled idea: card-by-card sequence, soft ticks; simulated keypress for Ctrl+Shift+S
Music: same bed
Transition mood: soft crossfade → Scene 3

### Scene 3 — Highlights — Markets + native currencies — 6s
Recreate Markets tab: USA header, index heatmap blocks green/red, two columns “Top Gainers / Top Losers — strictly separated”, macro tiles “Inflation · Unemployment · GDP”. Row of currency tags: `$ ₹ ¥ £ € S$ HK$ A$ C$`. Caption: “USA + 9 more — no silent conversion, ever.”
Sequential/interaction: yes — heatmap fades in, then 3 currency tags pop sequentially, hold full set
Audio intent: confident peak, widest moment
Audio-coupled idea: beat-aligned reveal of currency tags, soft announcement cue on heatmap
Music: bed, subtle swell if cue allows
Transition mood: soft crossfade → Scene 4

### Scene 4 — Outro — logo + CTA — 6s
Center: store icon `icon_128.png` + “Ticker Screener” + tagline “Built for focused market watching.” Mint gradient button “Get the extension — Chrome & Firefox”. Small links: Blog · Feedback · vishwaroopgalgali.com. Hold 3s fully settled for readability.
Sequential/interaction: none — slow scale-in 0.95→1.0, then hold
Audio intent: resolve, music fades, bell rings, voice lands last line
Audio-coupled idea: final logo slam with `impact/impactBell_heavy_000`, let ring 1.5s over fade
Music: fade-out last 1.5s
Transition mood: hold to end, cut to black

**Music mood for this video:** steady, clean, warm corporate — vol-12
**Audio summary:** Warm steady bed throughout, ducked under calm Kokoro narration, with 2-3 soft motion-matched accents and a single deep bell on the final logo.
