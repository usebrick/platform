# usebrick.dev — Design System

The visual language of usebrick.dev is **brick-themed** — terracotta accent, warm dark mortar background, running-bond patterns.

## Color Tokens

Source: `packages/website/src/styles/global.css`

### Surfaces (warm dark mortar)

| Token | Hex | Usage |
|-------|-----|-------|
| `--surface-0` | `#1a0e08` | Page background (the deepest mortar) |
| `--surface-1` | `#231511` | Card background |
| `--surface-2` | `#2d1c17` | Elevated card, hover state |
| `--surface-3` | `#38201a` | Active state |

### Accent (terracotta — the brick color)

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-accent` | `#dc4a26` | Links, prompts, terminal $, focus rings |
| `--fill-accent` | `#c2410c` | Primary button background |
| `--fill-accent-hover` | `#9a3409` | Primary button hover |

### Text (warm off-whites)

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#f3e9e1` | Body text |
| `--text-secondary` | `#d4c4b6` | Subtitles, descriptions |
| `--text-muted` | `#8a7868` | Labels, captions |
| `--text-on-accent` | `#1a0e08` | Text on terracotta backgrounds |

### Semantic State (brick-compatible palette)

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-success` | `#84a07a` | Success messages (sage, not pure green) |
| `--text-warning` | `#c89060` | Warnings (amber, not pure yellow) |
| `--text-danger` | `#b86a4a` | Errors (rust, not pure red) |
| `--text-info` | `#b09c8a` | Info (warm stone) |

### Borders

| Token | Value | Usage |
|-------|-------|-------|
| `--border` | `rgba(220, 74, 38, 0.10)` | Subtle dividers |
| `--border-strong` | `rgba(220, 74, 38, 0.18)` | Card outlines |
| `--border-accent` | `rgba(220, 74, 38, 0.35)` | Active/focused cards |
| `--border-danger` | `rgba(184, 106, 74, 0.40)` | Error outlines |

### Spacing scale (4px base)

Defined in `global.css` as `--space-1` through `--space-20`. Use the token, never hardcode `rem` values.

### Radii

| Token | Value | Usage |
|-------|-------|-------|
| `--radius` | `6px` | Default (buttons, cards) |
| `--radius-lg` | `12px` | Larger cards, modals |
| `--radius-xl` | `20px` | Hero panels |

### Easing

| Token | Value | Usage |
|-------|-------|-------|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Default (CSS + GSAP) |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | Symmetric motion |

### Shadows (warm-tinted to fit the brick palette)

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.4)` | Subtle elevation |
| `--shadow-md` | `0 4px 12px rgba(0, 0, 0, 0.5)` | Cards |
| `--shadow-lg` | `0 12px 32px rgba(0, 0, 0, 0.6)` | Modals, popovers |
| `--shadow-glow` | `0 0 24px rgba(220, 74, 38, 0.25)` | Accent glow on focus/hover |

## Typography

- **Sans**: Inter (Google Fonts)
- **Mono**: IBM Plex Mono (Google Fonts)

CSS custom properties:

```css
--font-sans: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-mono: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace;
```

## Component Patterns

- **Nav** — fixed translucent bar at top, `backdrop-filter: blur(8px)`, terracotta border on the brand `/`
- **Hero** — full-bleed WebGL canvas + content above. The terracotta `t-prompt` ($) is the visual anchor.
- **Tool cards** — `.tool-card` with click-to-break animation. Button role, keyboard accessible.
- **Terminal** — `.terminal` with 3 dots + monospace body. The terracotta `$` prompt is the brand.
- **Compare** — 2-column grid. Yay column has terracotta border + faint gradient. Nay column has strikethrough text.
- **Calibration** — large stat cards with counting animation on first reveal.
- **CTA** — gradient background (mortar → terracotta → mortar) with brick pattern overlay.

The components live in `packages/website/src/components/`:

- `Nav.astro`, `Hero.astro`, `ToolCard.astro`, `Tools.astro`
- `Compare.astro`, `Calibration.astro`, `CTASection.astro`
- `Terminal.astro`, `Footer.astro`, `BrickShader.astro` (the WebGL background)

## Interaction Scripts

All client-side scripts in `packages/website/src/scripts/`:

- `lenis.ts` — Lenis smooth-scroll provider
- `brick-shader.ts` — WebGL canvas (the running-bond brick background)
- `break-on-hover.ts` — click-to-break animation on tool cards
- `counter.ts` — counting animation for calibration stats
- `reveal.ts` — IntersectionObserver reveal-on-scroll
- `copy-install.ts` — copy-to-clipboard for the install command

## Accessibility

- WCAG AA contrast on all text/background pairs (verified)
- Skip-to-content link (`.skip-to-content`) in `<body>` start
- Tool cards are `role="button"` with keyboard handler
- `prefers-reduced-motion` honored in all animation scripts
- axe-core automated tests in CI

## How to Add a New Component

1. Create `packages/website/src/components/<Name>.astro`
2. Style with tokens from `global.css` — never hardcode hex
3. Add the component to the page in `pages/index.astro`
4. If interactive, add the script to `src/scripts/` and import in `Base.astro`
5. If a new animation, honor `prefers-reduced-motion`
6. Add a test in `packages/website/tests/a11y/` (Playwright + axe-core)
