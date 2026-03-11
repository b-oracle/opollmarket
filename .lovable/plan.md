

## Fix Telegram Bot Bugs + Add FAQ & Forex Support

### Bug 1: "Market not found" when predicting
**Root cause**: In `handleCallback` (line 926-931), the `mkt_cust_` callback check comes AFTER the `mkt_` check. Since `mkt_cust_UUID` starts with `mkt_`, it matches `mkt_` first. `handleMarketDetail` then strips `mkt_` prefix, yielding `cust_UUID` as the market ID — which doesn't exist.

**Fix**: Reorder the callback checks so `mkt_cust_` is evaluated before `mkt_`.

### Bug 2: "Invalid email or password" on Quick Trade custom amounts
**Root cause**: When a user clicks "Custom Amount" in Quick Trade, a session is stored in `telegram_link_sessions` with email = `qt_custom:BTC`. When the user then types a number, `handleLinkSession` (line 326) runs first, finds this session, and treats the number as a password for account linking — resulting in the authentication error. `handleQTCustomInput` never gets called.

**Fix**: In `handleLinkSession`, skip sessions where the email starts with `qt_custom:` or `mkt_custom:` (those are for custom amount flows, not account linking).

### Feature: Add FAQ to Telegram
- Add `/faq` command that prompts the user to type their question
- Store a `faq_session` in `telegram_link_sessions` (email = `faq:`)
- When the user types a question, call the `faq-ai` edge function (non-streaming mode needed since Telegram doesn't support SSE) and return the AI answer
- Add `❓ FAQ` button to the help menu and home screen

### Feature: Add Forex to Quick Trade on Telegram
- Add forex price fetching using the Frankfurter API (same source the web app uses)
- Add forex asset emojis and labels (EUR/USD, GBP/USD, etc.)
- The enabled assets come from `commission_settings.qt_enabled_assets`, so if forex pairs like `EUR/USD` are already there, they'll appear automatically
- Add market hours check: if forex market is closed, show a notice instead of trade buttons

### Implementation — single file change

**File: `supabase/functions/telegram-bot/index.ts`**

1. **Fix callback order** (~line 926-938): Move `mkt_cust_` check before `mkt_` check
2. **Fix session conflict** (~line 332): In `handleLinkSession`, after finding a session, check if `session.email` starts with `qt_custom:`, `mkt_custom:`, or `faq:` — if so, return `false` to let the correct handler process it
3. **Add `place-bet` userId** (~line 1109): Include `userId` in the place-bet request body so it can work when called with service role auth
4. **Add `/faq` command**: New handler that creates a `faq:` session, prompts user to type a question
5. **Add FAQ session handler**: In the text input flow, detect `faq:` sessions, call the `faq-ai` function (with `stream: false`), and send the AI response
6. **Add `cmd_faq` callback** in `handleCallback`
7. **Add FAQ button** to home screen and help menus
8. **Add forex price fetching**: New `fetchForexPrice` helper using Frankfurter API (`https://api.frankfurter.app/latest?from=X&to=Y`)
9. **Extend `handleQTAssetSelected`**: Detect forex pairs (contain `/`) and use forex price fetcher; show market hours status
10. **Extend `handleQTSideSelected`**: Add market hours check for forex assets before placing trades

