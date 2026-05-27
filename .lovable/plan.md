## Goal
Complete the magic-link account-linking flow already started, fully removing plaintext password handling from both bots so no credentials transit Twilio or Telegram.

## Already in place (from prior turn)
- `bot_link_tokens` table (service-role only, 10-min single-use tokens)
- `claim-bot-link` edge function (validates token, binds authed user to telegram/whatsapp identifier)
- `/link-bot` page (`src/pages/LinkBot.tsx`) + route in `App.tsx`
- Telegram `/link` command refactored to mint token + send deep-link button

## Remaining work

1. **Telegram bot cleanup** (`supabase/functions/telegram-bot/index.ts`)
   - Fix the 2 stale `handleLinkStart` callers to match new signature `(token, supabase, chatId, username)`
   - Remove any leftover password-state handling, `signInWithPassword`, message-delete-after-password logic, and the email→password session steps
   - Ensure no code path reads a message body as a password anymore

2. **WhatsApp webhook refactor** (`supabase/functions/whatsapp-webhook/index.ts`)
   - Replace the email+password session flow with: `/link` → mint a `bot_link_tokens` row keyed to the WhatsApp phone → reply with `https://opoll.org/link-bot?token=...`
   - Drop `signInWithPassword` and any column in the WhatsApp session table that holds an awaiting-password state (keep table, just stop using/writing the password-pending state)
   - Keep all other bot commands (balance, predictions, etc.) working for already-linked users

3. **LinkBot page polish**
   - Confirm it requires an authenticated session; if logged out, send through normal sign-in then return to `/link-bot?token=...`
   - Show success/expired/invalid states and a link back to the bot

4. **Security finding**
   - Mark `msgbot_credential_exposure` as fixed with an explanation referencing the magic-link flow
   - Update security memory: note that bot linking is magic-link only; password-over-chat must never be reintroduced

## Out of scope
- No UI changes outside `/link-bot`
- No changes to other bot commands' business logic
- No migration changes (token table already exists)

## Verification
- Read both edge functions after edits to confirm zero remaining `signInWithPassword` calls and no message-body password reads
- Confirm `/link` in each bot returns only a deep link, never asks for a password