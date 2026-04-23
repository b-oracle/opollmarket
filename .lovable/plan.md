

## Goal

Make `https://opoll.org/` (the public homepage) satisfy Google OAuth verification requirements: clearly identify the brand, describe the app's functionality, explain what user data is requested and why, and surface a visible Privacy Policy link — all without requiring login.

## What will change

### 1. Add a public landing hero section to the top of `src/pages/Index.tsx`

A new `LandingHero` section will render **only when the user is signed out**. Signed-in users continue to see the markets feed exactly as today.

Contents of the hero (all visible without login):

- **Brand identity**: OPoll logo, name "OPoll Market", and tagline "The world's first social prediction platform on Telegram, WhatsApp & Web".
- **What the app does** (3–4 short bullets):
  - Predict real-world events across crypto, sports, politics, and culture.
  - Trade parimutuel rounds in seconds.
  - Follow and copy top traders, chat in Spaces and DMs.
  - Earn rewards from accurate predictions.
- **Data transparency block** titled "What we ask for when you sign in with Google":
  - Your name and profile picture — to display your public profile.
  - Your email address — to create and secure your account, send transactional notifications, and recover access.
  - We do not access your contacts, Drive, Gmail, Calendar, or any other Google data.
- **Primary CTAs**: "Get started" → `/auth`, "Browse markets" → scrolls to the existing markets list below.
- **Footer strip** with always-visible links: **Privacy Policy** (`/privacy`), **Terms** (`/terms`), **Disclaimer** (`/disclaimer`), **FAQ** (`/faq`), **Contact** (mailto or support route).

The footer link to **Privacy Policy must be the exact same URL** entered on the Google OAuth consent screen (`https://opoll.org/privacy`).

### 2. Ensure the homepage renders for logged-out users

Verified: `/` route in `src/App.tsx` is already public (no auth guard). No router changes needed. The hero will be conditionally rendered based on `useAuth().user` being `null`.

### 3. Update `index.html` and `SEOHead` defaults

- Refresh the `<title>` and `<meta name="description">` to clearly state what OPoll is in one sentence (currently fine but will be tightened).
- Add a `<meta name="robots" content="index, follow">` to ensure Google can crawl the homepage during verification.
- Replace the OG image URL (currently a stale `gpt-engineer-file-uploads` link unrelated to OPoll) with `https://opoll.org/og-image.png` so previews accurately represent the brand.

### 4. Make the Privacy Policy reachable from the homepage without login

The `/privacy` route is already public. We will:

- Add a visible "Privacy Policy" link in the new landing footer.
- Add the same link in `DesktopFooter` if it isn't already there, so it's reachable on every public page.

### 5. README note (optional, for your records)

Add a short section explaining that the homepage hero must not be removed, because Google OAuth verification depends on it.

## What will NOT change

- Signed-in user experience (markets feed, filters, boosts, search) — unchanged.
- Routing, auth flow, native Google sign-in, or web Google OAuth fallback.
- Privacy, Terms, Disclaimer, FAQ page content.
- Any backend, RLS, or edge function.

## Files to update

- `src/pages/Index.tsx` — add `LandingHero` component, render it when `!user`.
- `index.html` — refresh meta description, add robots tag, fix OG image URL.
- `src/components/SEOHead.tsx` — minor default description tightening.
- `src/components/DesktopFooter.tsx` — ensure Privacy/Terms/Disclaimer links are present.
- `README.md` — short note on Google OAuth homepage requirement (optional).

## Technical notes

- The hero will use existing design tokens (`bg-background`, `text-foreground`, `--primary`) — no new colors.
- Layout: full-width hero section, max-width container, mobile-first; renders above the existing `TopBar` content area.
- Conditional render: `{!user && <LandingHero />}` placed at the top of the Index return tree, before the markets grid.
- All copy will be plain English, no marketing fluff, focused on what Google reviewers need to confirm.

## Verification

After implementation:

- Visit `https://opoll.org/` in an incognito window → hero is fully visible, no login wall.
- Privacy Policy link is clickable and opens `https://opoll.org/privacy` without login.
- Google's OAuth verification checklist items (brand identity, functionality description, data purpose, privacy link, no login required) are all satisfied on the homepage.
- Logged-in users see the markets feed unchanged.

