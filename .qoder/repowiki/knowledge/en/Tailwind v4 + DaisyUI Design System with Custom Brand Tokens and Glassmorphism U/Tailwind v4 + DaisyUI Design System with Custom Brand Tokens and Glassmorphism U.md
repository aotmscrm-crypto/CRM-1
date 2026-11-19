---
kind: frontend_style
name: Tailwind v4 + DaisyUI Design System with Custom Brand Tokens and Glassmorphism UI
category: frontend_style
scope:
    - '**'
source_files:
    - frontend/src/index.css
    - frontend/src/App.css
    - frontend/src/lib/utils.js
    - frontend/src/Components/ui/button.jsx
    - frontend/src/Components/ui/auth-switch.jsx
    - frontend/package.json
---

# Frontend Style System

## Approach

The frontend (`frontend/`) is a React 19 + Vite SPA whose styling is built on **Tailwind CSS v4** (via `@tailwindcss/vite` plugin) with the **DaisyUI v5** component plugin. Styling is primarily done through utility classes in JSX; there is no separate stylesheet per component.

A custom design system is layered on top of Tailwind via the `@theme` block in `src/index.css`, which declares the brand palette, typography, and global CSS variables. The project also uses:
- `class-variance-authority` (cva) for variant-driven component styles (see `Components/ui/button.jsx`).
- `clsx` + `tailwind-merge` via a shared `cn()` helper in `src/lib/utils.js` to safely merge class strings.
- `@base-ui/react` primitives (`mergeProps`, `useRender`) for accessible base components.
- `lucide-react` as the icon library.
- `framer-motion`, `gsap`, `three` + `@react-three/fiber` + `@react-three/drei` + `ogl` for animated / 3D hero visuals.
- `daisyui` as a secondary component layer (plugin registered in `index.css`).

There is no `tailwind.config.js`; Tailwind v4 configuration lives entirely in CSS via `@import "tailwindcss"` and `@plugin "daisyui"` at the top of `src/index.css`.

## Key Files

- `frontend/src/index.css` — root stylesheet: imports Tailwind/DaisyUI, defines `@theme` tokens, sets dark mode defaults, global body/font rules, and reusable glassmorphism utility classes (`calm-nav`, `nova-card`, `nova-pill`, `nova-beam`, gradient text helpers).
- `frontend/src/App.css` — animation keyframes (`floatSlow`, `pulseGlow`) and their utility wrappers (`animate-float-slow`, `animate-pulse-glow`).
- `frontend/src/lib/utils.js` — shared `cn(...)` helper combining `clsx` and `tailwind-merge`.
- `frontend/src/Components/ui/button.jsx` — cva-based button primitive exposing `size` and `variant` variants.
- `frontend/src/Components/ui/auth-switch.jsx` — example of how brand tokens are consumed in JSX via Tailwind's arbitrary color syntax (`bg-tech_orange`, `border-tech_blue/40`, `text-tech_orange`, etc.).
- `frontend/package.json` — declares all style-related dependencies.

## Architecture & Conventions

### Theme tokens
All colors are declared under `@theme` in `src/index.css` using CSS custom properties with a consistent naming scheme:
- Primary brand palette: `--color-tech_orange` (0077b6 blue) and `--color-tech_blue` (#ff6200 orange), each with 100–900 shades.
- Neutral palettes: `slate_dark`, `ice_white`, `bright_snow`, `platinum`, `alabaster_grey`, `pale_slate`, `slate_grey`, `iron_grey`, `gunmetal`, `carbon_black`.
- Backward-compatible aliases map older names (`copperwood`, `sunlit_clay`, `cornsilk`, `black_forest`, `olive_leaf`, `prussian_blue`, `deep_space_blue`, `muted_teal`, `burnt_peach`, `tan`) to the new tokens so existing class references keep working.

Typography is centralized via `--font-sans: 'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;` and applied globally on `body`.

### Global defaults
- Dark theme is enforced via `:root { color-scheme: dark; }` and `body` background `#080d1a` with light text `#f8fafc`.
- Base font size is boosted to `19px` on `html` (commented as an overall text-size boost across Auth, Dashboard, Navbars, Content, and Tables).
- A custom scrollbar is defined for WebKit browsers.

### Reusable visual motifs
Several hand-written utility classes encapsulate the project's signature glassmorphism aesthetic:
- `.calm-nav` / `.calm-nav-scrolled` — frosted navbar with backdrop blur and brand-colored borders.
- `.calm-card` / `.nova-card` / `.nova-pill` — translucent cards with `backdrop-filter: blur(...)`, subtle borders, and hover glow effects.
- `.nova-grid-bg` — dot-grid background.
- `.bg-radial-theme-glow` — multi-stop radial gradients mixing tech orange and tech blue.
- `.gradient-text-peach` / `.gradient-text-teal` — gradient-clipped text utilities.
- `.nova-beam` — a thin horizontal gradient divider.

These are used directly in JSX via className strings rather than being re-exported as components.

### Component-level styling
- Primitive components live under `src/Components/ui/` and follow the shadcn-style pattern: a cva definition (`buttonVariants`) plus a thin wrapper component that merges props via `@base-ui/react/use-render` and `mergeProps`. Variants include `size` (default, sm, lg, xl, xs, icon variants) and `variant` (default, destructive, destructive-outline, ghost, link, outline, secondary).
- Page-level components (under `Dashboard/`, `LandingPage/`, `Auth/`) compose these primitives and apply brand tokens inline as Tailwind classes.

### Responsive strategy
Responsive breakpoints are handled purely through Tailwind's responsive prefixes (`sm:`) inside utility classes and cva variant strings — no media queries in custom CSS beyond the global defaults.

## Conventions & Constraints

- **Utility-first**: Styles are written as Tailwind class strings in JSX; there are no per-component CSS files.
- **Brand tokens over raw colors**: New code should reference the `tech_orange` / `tech_blue` / `slate_dark` / `ice_white` token families instead of hard-coded hex values.
- **Dark-only theme**: The app enforces `color-scheme: dark` and a dark body background; no light-mode toggle exists in the current codebase.
- **Glassmorphism motif**: Translucent surfaces use `backdrop-filter: blur(...)` combined with semi-transparent backgrounds and low-opacity brand-colored borders — this is the established visual language for navbars, cards, and pills.
- **Shared `cn` helper**: Class merging goes through `src/lib/utils.js`'s `cn()` function (combining `clsx` + `tailwind-merge`); the button primitive demonstrates this pattern.
- **Component variants via cva**: When building new UI primitives, follow the `button.jsx` pattern — define a `cva` object with `variants` and `defaultVariants`, then wrap it in a component that passes merged classes via `cn()`.
- **Icons from lucide-react**: Iconography is imported from `lucide-react` and passed as children to styled containers.
- **No Tailwind config file**: All Tailwind customization (plugins, theme tokens) is expressed in CSS via `@import` / `@plugin` / `@theme` in `src/index.css`.