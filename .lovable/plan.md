
## Native-feel Splash + Onboarding for the Capacitor App

Goal: when a user opens the installed Android/iOS app (or hits the web for the first time), they see a polished splash screen followed by a swipeable onboarding carousel — indistinguishable from a hand-built native app. Web visitors who already use the product won't see it again.

---

### What gets built

**1. Native splash (Capacitor-controlled, before JS even boots)**
- Add `@capacitor/splash-screen` plugin.
- Configure in `capacitor.config.ts`:
  - 2s auto-hide, dark background `#000000`, fade animation, no spinner.
  - Use `splash.png` (2732×2732, centered logo on black) + `splash_dark.png`.
- Generate platform splash assets with `@capacitor/assets` from a single `assets/splash.png` + `assets/icon.png`.
- Hide the splash from JS once the React tree mounts AND auth state has been resolved (so users don't see a flash of the login screen).

**2. In-app animated splash (web + native fallback)**
- New component `src/components/AppSplash.tsx`: full-screen black overlay with the OPOLL logo scaling/fading in, primary cyan glow pulse, then fades out.
- Renders for ~1.2s on every cold boot of the SPA (covers the gap between Capacitor splash hide and first meaningful paint, and gives PWA/web users the same feel).
- Mounted at the top of `App.tsx`, controlled by a single `useState` + `sessionStorage` flag so it only shows once per session.

**3. Onboarding carousel (first-run only)**
- New route `/welcome` and component `src/pages/Welcome.tsx`.
- 4 swipeable slides using Framer Motion + touch gestures (no extra deps):
  1. **Predict anything** — markets hero illustration, tagline.
  2. **Trade in seconds** — Quick Trade preview, "lightning-fast parimutuel rounds".
  3. **Earn with your circle** — Copy trading + referrals.
  4. **Go social** — Spaces, DMs, Stories.
- Each slide: full-bleed gradient background, large icon/illustration, headline (Space Grotesk 32px), 1-line subtext, page indicator dots.
- Bottom CTAs: `Skip` (top-right) and `Next` → final slide shows `Get Started` which routes to `/auth`.
- Uses existing design tokens (`--primary`, `--neon-yes`, glass utilities) — no new colors.

**4. First-run gating**
- New hook `src/hooks/useFirstRun.ts`:
  - Reads `localStorage.opoll_onboarded_v1`.
  - On native (Capacitor.isNativePlatform()) AND not onboarded → redirect to `/welcome` from `/`.
  - On web, only redirect if the user lands on `/` unauthenticated and has never visited before (keeps SEO landing intact for crawlers via a `?skip_onboarding=1` bypass and a user-agent check for bots — bots see `/index` directly).
- Mark complete when user taps `Get Started` or `Skip`.
- Reset button hidden in **Admin Settings → Diagnostics** (super admin only) for QA.

**5. Polish**
- Status bar plugin (`@capacitor/status-bar`): set to dark style, transparent on Android, matches splash background.
- Edge-to-edge: respect existing `--safe-top` / `--safe-bottom` vars on the welcome screen.
- Haptic feedback on slide change (Capacitor `Haptics.impact({ style: Light })`) — no-ops on web.
- Preload onboarding slide images so transitions are instant.

---

### Files to create

- `src/pages/Welcome.tsx` — onboarding carousel
- `src/components/AppSplash.tsx` — animated in-app splash overlay
- `src/components/onboarding/OnboardingSlide.tsx` — single slide presenter
- `src/hooks/useFirstRun.ts` — gating logic + reset helper
- `src/lib/nativeUI.ts` — small wrapper for `SplashScreen.hide()`, `StatusBar.setStyle()`, `Haptics.impact()` (safe no-ops on web)
- `public/onboarding/slide-1.webp` … `slide-4.webp` — illustrations (generated)
- `public/splash.png` + `public/splash_dark.png` — Capacitor splash sources

### Files to edit

- `package.json` — add `@capacitor/splash-screen`, `@capacitor/status-bar`, `@capacitor/haptics`, `@capacitor/assets` (dev)
- `capacitor.config.ts` — add `SplashScreen` plugin config (launchAutoHide false, background `#000000`, fade)
- `src/App.tsx` — mount `<AppSplash />`, register `/welcome` route, call `useFirstRun()` and `nativeUI.boot()` once
- `src/pages/admin/AdminSettings.tsx` — add "Reset Onboarding" button under super-admin diagnostics

### Native generation step (user runs locally after pulling)

```
npx @capacitor/assets generate --iconBackgroundColor '#000000' --splashBackgroundColor '#000000'
npx cap sync
```

This regenerates iOS `LaunchScreen.storyboard` and Android `splash.png` densities from the single source images.

---

### What stays out of scope

- iOS CallKit / VoIP push (still parked until the certificate is generated).
- Permission pre-prompts (notifications, mic) — kept on the existing in-app modals so we don't trigger system prompts during onboarding.
- A/B testing or analytics on slide drop-off — can be added later if needed.

### Effort

~45 min of Lovable-side work. After approval the user only needs to run `npm install`, `npx @capacitor/assets generate`, `npx cap sync`, then rebuild in Android Studio / Xcode to see the native splash. The web/PWA splash + onboarding ships immediately on next deploy.
