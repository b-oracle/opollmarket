

## Edge-to-Edge Rendering with Dynamic Safe Area Handling

### Problem
Safe area insets are hardcoded inline across 39+ files using raw `env(safe-area-inset-*)` strings with static `calc()` assumptions (e.g. `calc(5rem + env(safe-area-inset-bottom))`). This is fragile, inconsistent, and doesn't adapt dynamically when system insets change (e.g. keyboard appearance, orientation change, Capacitor vs PWA vs browser).

### Solution
Centralize safe area values into CSS custom properties set at the `:root` level, then replace all inline `env()` references with these variables. This gives one place to override for any platform.

### Changes

**1. `src/index.css`** — Define CSS custom properties for safe areas
```css
:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);

  /* Derived layout tokens */
  --topbar-h: 3.5rem;
  --bottomnav-h: 4rem;
  --content-top: calc(var(--topbar-h) + var(--safe-top));
  --content-bottom: calc(var(--bottomnav-h) + var(--safe-bottom));
}
```
- Update `body` to use `padding-left: var(--safe-left); padding-right: var(--safe-right);` instead of raw `env()`.
- Add utility classes: `.pt-safe`, `.pb-safe`, `.pt-content`, `.pb-content` for common patterns.

**2. `src/components/TopBar.tsx`**
- Replace `paddingTop: 'env(safe-area-inset-top)'` with `paddingTop: 'var(--safe-top)'`

**3. `src/components/BottomNav.tsx`**
- Replace `paddingBottom: 'env(safe-area-inset-bottom)'` with `paddingBottom: 'var(--safe-bottom)'`

**4. All page files using inline safe-area calc** (~20 files including Index, Feed, Portfolio, Profile, UserProfile, MarketDetail, QuickTrade, Rankings, Messages, etc.)
- Replace patterns like `calc(5rem + env(safe-area-inset-bottom))` → `var(--content-bottom)`
- Replace `calc(3.5rem + env(safe-area-inset-top))` or similar → `var(--content-top)`
- Replace raw `env(safe-area-inset-top)` → `var(--safe-top)` and `env(safe-area-inset-bottom)` → `var(--safe-bottom)`

**5. Chat views** (ChatView, CommunityChat, SupportChat, VoiceCallOverlay, etc.)
- Same variable replacements for `max()` and `env()` patterns in style props

### Why This Is Better
- **Single source of truth**: Change inset behavior in one CSS file
- **Platform overrides**: Capacitor native shell can inject different `--safe-*` values via JS if needed
- **Orientation changes**: CSS custom properties with `env()` already respond dynamically; centralizing just removes duplication
- **Consistency**: No more mismatched calc expressions across files

### Files Changed
| File | Change |
|------|--------|
| `src/index.css` | Add `--safe-*` and `--content-*` CSS variables, utility classes |
| `src/components/TopBar.tsx` | Use `var(--safe-top)` |
| `src/components/BottomNav.tsx` | Use `var(--safe-bottom)` |
| ~20 page/component files | Replace inline `env()` and `calc()` with CSS variables |

