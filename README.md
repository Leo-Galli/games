# Games — Another Horizon

A small, dependency-free browser arcade: eight mini-games on a single page, built with plain HTML, CSS and JavaScript. No frameworks, no build step, no network calls.

Live: <https://games.another-horizon.eu/>

## Games

| Game | Type | Notes |
| --- | --- | --- |
| **Snake** | Arcade | Grid snake with growing speed, best score saved locally |
| **2048** | Puzzle | Full merge logic, game-over detection, best score |
| **Memory** | Memory | Eight pairs, move counter, best score in moves |
| **Minesweeper** | Logic | 9×9 with 10 mines, safe first click, flags, timer |
| **Breakout** | Arcade | Bricks, lives, mouse/keyboard paddle |
| **Tic-Tac-Toe** | Strategy | Unbeatable minimax AI, win/draw/loss record |
| **Simon** | Sequence | Growing colour sequence with WebAudio tones |
| **Reaction** | Reflex | Five rounds, average reaction time |

## Features

- **Keyboard and touch** — arrows/WASD, Space, Enter, Esc, plus swipe on touch devices.
- **Shared theme** — the light/dark choice is stored in an `ah-theme` cookie scoped to `.another-horizon.eu` (with `localStorage` fallback), so one choice applies across every Another Horizon site.
- **Local scores** — best results live in `localStorage` under `ah-games-*`; nothing is uploaded.
- **Resilient** — each game mounts into a modal stage and returns a cleanup function, so switching games stops timers, animation frames and listeners.
- **Accessible** — focus-visible styles, ARIA labels on controls, reduced-motion friendly.

## Files

```
index.html        Page shell: nav, hero, game grid, footer, modal stage
app.js            Game registry, eight games, stage manager, theme + menu wiring
styles.css        Shared Another Horizon design system + game-specific styles
favicon.svg       Site icon
site.webmanifest  PWA manifest
robots.txt        Crawler rules
sitemap.xml       Single-URL sitemap
```

## Local development

There is no build step — serve the folder with any static server:

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

## License

© 2026 Leonardo Galli · Another Horizon.
