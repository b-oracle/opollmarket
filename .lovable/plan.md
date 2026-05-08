## Goal

On the crypto Up/Down market detail page, replace the static "100% Chance" green chip (above the live chart) with a **bold, animated, realtime countdown** that color-shifts green → amber → red as the round nears expiry. Non-crypto markets keep the existing "% Chance" text unchanged.

## Where it lives

`src/pages/MarketDetail.tsx` line ~865 — the `<span className="text-xl font-bold text-green-500">…% Chance</span>` next to the chart title. The crypto branch should render a new countdown component; the binary/multi market branches stay as-is.

The round end timestamp is already available via `market.autoResolveDeadline` (used in `effectiveEndDate` at line 491).

## New component

`src/components/quick-trade/CryptoRoundLiveCountdown.tsx`

- Props: `endsAt: string`, `className?: string`.
- 1s `setInterval` ticking `Date.now()`.
- Computes `remainingMs` and a `phase` based on absolute thresholds (matches typical 5m round feel and still works on longer rounds):
  - `> 60s` → green (`text-green-500`)
  - `15s – 60s` → amber (`text-amber-400`)
  - `≤ 15s` → red (`text-red-500`) + `animate-pulse` + subtle scale bump
- Format: `M:SS` (or `H:MM:SS` if ≥ 1h). Uses `tabular-nums` so digits don't jitter.
- Bold + large (`text-xl sm:text-2xl font-extrabold tracking-tight`).
- Each second the digit container gets a quick `animate-fade-in` key change (key on `seconds`) for a subtle tick animation.
- Pulsing red dot prefix when in the red phase to reinforce urgency.
- When `remainingMs <= 0` → renders `Resolving…` in muted red, no animation.
- Accessible: `aria-live="polite"`, `role="timer"`.

No new keyframes needed — uses existing `animate-pulse` and `animate-fade-in` utilities already configured in `tailwind.config.ts`.

## Edit in `MarketDetail.tsx`

Around line 863–866, change the right-side span only for the crypto round case:

```text
[Chart title row]
  Left:  "{ASSET} · Live Price"   (unchanged)
  Right (crypto round + autoResolveDeadline present):
         <CryptoRoundLiveCountdown endsAt={market.autoResolveDeadline} />
  Right (everything else): existing "{leading}% Chance · …" / "{yesPercent}% Chance"
```

Import the new component at the top of the file.

## Out of scope

- The smaller header pill `CryptoRoundCountdown` elsewhere on the page stays as-is (different visual role).
- No changes to bet buttons, pools, chart, or any data fetching.
- No design-token additions; uses Tailwind's existing `green-500 / amber-400 / red-500` which are already used across the crypto Up/Down UI.

## Acceptance

- On a live BTC/ETH/SOL 5m round, the chip shows e.g. `4:37` in bold green, ticking every second.
- Crosses to amber at 1:00 and to pulsing red at 0:15.
- At 0:00 it reads `Resolving…`.
- Non-crypto markets visually unchanged.
