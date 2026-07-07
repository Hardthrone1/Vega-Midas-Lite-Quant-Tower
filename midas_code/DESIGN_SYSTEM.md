<!-- VEGA Dashboard — Premium Fluent UI Design System
     Applied: MGC/MNQ futures control tower with Microsoft design language
     Features: Glass-morphism, elevation system, semantic colors, motion curves -->

# VEGA Design System — Premium Fluent UI Implementation

## Overview

The VEGA dashboard now ships with a **premium Fluent UI design system** that transforms the plain dark theme into an elegant, instrument-panel aesthetic. This design is inspired by Microsoft's Fluent design language, tailored for algorithmic trading.

## What Changed

### 1. **theme.css** — Fluent Design Tokens
Complete redesign of the CSS custom properties system:

- **Color Palette**: Deep navy field (`#0f111b`) with precision grays, status colors, and MGC gold accent (`#e7b75f`)
- **Elevation System**: 5-tier shadow hierarchy (`--shadow-xs` through `--shadow-xl`)
- **Typography**: Display font (Space Grotesk) for headers, body font (Inter) for content, mono (JetBrains) for data
- **Type Scale**: 8 sizes from captions (11px) to display (32px)
- **Spacing Grid**: 8px base with semantic variables (`--space-xs` through `--space-2xl`)
- **Border Radius**: Subtle (2px–12px) following Fluent conventions
- **Motion**: Standard Fluent easing curves and duration tokens

### 2. **components.css** — Premium UI Elements
Refined component styling with modern interactions:

- **Cards & Panels**: Elevation-based depth with hover states
- **Glass Panels**: Backdrop-filter blur effect for premium aesthetic
- **Buttons**: Primary, secondary, subtle variants with smooth transitions
- **Input Fields**: Refined borders, focus states with accent glow
- **Tables**: Clean styling with hover highlighting
- **Badges**: Status-aware colors (success, warning, error, info)
- **Status Indicators**: Pulsing dots for live status

### 3. **animations.css** — Fluent Motion
Professional animation suite with 20+ keyframe animations:

- **Entry/Exit**: slideUp/Down/Left/Right, fadeIn/Out, scaleIn/Out
- **Attention**: pulse, bounce, spring, heartBeat, glow
- **Utility Classes**: Staggered animations with delay utilities
- **Skeleton Loaders**: Shimmer effect for loading states
- **Loading Spinners**: Smooth rotating indicators
- **Transitions**: Transition group classes for React

### 4. **layout.css** — Grid & Spacing System
Professional layout utilities:

- **Grid System**: 1–4 column grids with auto-fit variants
- **Flexbox Helpers**: flex-between, flex-center, row/stack layouts
- **Panels**: Header, body, footer sections with dividers
- **Sidebar Layouts**: Left/right sidebars with main content
- **Responsive**: Mobile-first breakpoints at 768px and 1280px
- **Scrollable Containers**: Native scroll styling

## Design Principles

1. **Instrument Panel Aesthetic**: Quiet, focused environment for trading decisions
2. **Data Hierarchy**: Monospace for numbers, sans-serif for structure
3. **Status-Driven Color**: Status palette carries meaning (green=healthy, red=alert)
4. **Glass Morphism**: Subtle backdrop blur for depth without distraction
5. **Precision Motion**: Smooth 200ms transitions, Fluent easing curves
6. **Accessibility**: WCAG AA compliant color contrast, focus indicators

## Token Reference

### Colors

**Surfaces:**
- `--bg-primary`: Deep field (`#0f111b`)
- `--surface-1`: Elevated card (`#1a1f2e`)
- `--surface-2`: Raised element (`#21272f`)
- `--surface-3`: Highest elevation (`#282f3f`)

**Accent (MGC Gold):**
- `--accent-primary`: `#e7b75f`
- `--accent-hover`: `#f0c470`
- `--accent-active`: `#d99e44`
- `--accent-glow`: Rgba with 24% opacity (subtle nimbus)

**Status:**
- `--status-success`: `#46c08a` (green, healthy)
- `--status-warning`: `#e0a64b` (amber, caution)
- `--status-error`: `#e0604f` (red, critical)
- `--status-info`: `#5aa6e0` (blue, informational)

**Text:**
- `--text-primary`: `#e7ecf3` (primary ink)
- `--text-secondary`: `#aab4c4` (secondary)
- `--text-tertiary`: `#7a8394` (muted/captions)
- `--text-disabled`: `#505969` (disabled state)

### Spacing (8px Base)

| Token | Size | Use Case |
|-------|------|----------|
| `--space-xs` | 4px | Tight spacing, icons |
| `--space-sm` | 8px | Labels, small gaps |
| `--space-md` | 12px | Default padding |
| `--space-lg` | 16px | Card padding, gaps |
| `--space-xl` | 24px | Section spacing |
| `--space-2xl` | 32px | Major breaks |

### Typography

**Display Font**: Space Grotesk (h1–h4, headers)
**Body Font**: Inter (paragraphs, UI text)
**Mono Font**: JetBrains Mono (code, data)

Type scale: 11px → 12px → 13px → 14px → 16px → 18px → 24px → 32px

### Shadows (Elevation)

| Level | Shadow |
|-------|--------|
| xs | `0 1px 2px rgba(0,0,0,0.12)` |
| sm | `0 2px 4px rgba(0,0,0,0.16)` |
| md | `0 4px 8px rgba(0,0,0,0.20)` |
| lg | `0 8px 16px rgba(0,0,0,0.28)` |
| xl | `0 16px 32px rgba(0,0,0,0.36)` |

### Motion

**Easing Curves** (Fluent standard):
- `--ease-standard`: `cubic-bezier(0.4, 0, 0.2, 1)` (default)
- `--ease-enter`: `cubic-bezier(0.5, 0, 0.1, 1)` (slide in)
- `--ease-exit`: `cubic-bezier(0.3, 0.2, 0.8, 1)` (slide out)

**Durations**:
- `--duration-xs`: 75ms (quick)
- `--duration-sm`: 120ms (snappy)
- `--duration-md`: 200ms (standard)
- `--duration-lg`: 300ms (smooth)
- `--duration-xl`: 400ms (cinematic)

## Usage Examples

### Premium Card
```html
<div class="card premium p-lg">
  <h3 class="panel-title">MGC Position</h3>
  <p class="text-secondary">Micro Gold Futures</p>
</div>
```

### Glass Panel (Elevated)
```html
<div class="glass-panel elevation-3">
  <div class="flex-between">
    <span class="eyebrow">LIVE</span>
    <span class="status-dot success animate-pulse"></span>
  </div>
</div>
```

### Button with Animation
```html
<button class="btn-primary p-lg hover-glow transition-normal">
  Execute Trade
</button>
```

### Grid Layout
```html
<div class="grid grid-cols-3 gap-lg">
  <div class="card">...</div>
  <div class="card">...</div>
  <div class="card">...</div>
</div>
```

### Animated Entry
```html
<div class="animate-slideUp duration-md">
  Content slides in with fade
</div>
```

## Hot Reload

Vite hot-reloads CSS changes instantly. Edit any style file and refresh your browser to see changes immediately:

1. `src/styles/theme.css` — Token changes apply app-wide
2. `src/styles/components.css` — Component styling updates
3. `src/styles/animations.css` — Motion refinements
4. `src/styles/layout.css` — Grid/spacing adjustments

## Next Steps

1. **Review in Browser**: Open http://localhost:5173 and verify the elegant, premium look
2. **Custom Colors**: Adjust token values in theme.css to match brand colors
3. **Component Library**: Build reusable React components wrapping Fluent UI primitives
4. **Design Tokens Export**: Use graphify to map components to trading logic
5. **Obsidian Integration**: Document design decisions in your knowledge vault

## Files Modified/Created

- ✅ `src/styles/theme.css` — Fluent design tokens (replaced plain dark theme)
- ✅ `src/styles/components.css` — Premium component styling (new)
- ✅ `src/styles/animations.css` — Motion suite (new)
- ✅ `src/styles/layout.css` — Grid/spacing system (new)
- ✅ `src/main.tsx` — Import order updated

---

**Design Philosophy**: This system trades pixels for polish. Every shadow, curve, and transition serves the core goal: a calm, focused instrument panel where traders make precision decisions. The MGC gold accent nods to the contract you're trading. The Fluent typography hierarchy keeps data hierarchy clear. Glass-morphism adds depth without clutter.

The premium feel comes not from decoration, but from intentionality.
