

## Redesign Chat Gift Modal to Match Space Emoji Gifting

### What changes

**`src/components/chat/ChatGiftModal.tsx`** — Complete redesign

Replace the current dollar-amount preset buttons + custom input with the same emoji grid used in Spaces:

1. Use the same `GIFT_EMOJIS` and `EMOJI_PRICES` constants from SpaceRoom:
   ```
   GIFT_EMOJIS = ["💸", "🤑", "💰", "💵", "🌹", "💝", "🔥", "🕺", "💃", "👏", "👍", "❤️", "😂", "💯", "🎯"]
   EMOJI_PRICES = { "💸": 0.10, "🤑": 0.25, "💰": 0.50, "💵": 0.05, ... } // default 0.05
   ```

2. Replace the dialog layout with a bottom-sheet style matching the Space gift picker:
   - Header: recipient avatar + "Send gift to {name}" + "Emoji gifts deduct from your gift balance"
   - Top-right: Gift Balance label + amount in green
   - 4-column emoji grid — each tile shows emoji + price, disabled if can't afford
   - Tapping an emoji immediately sends the gift (no confirm button needed)
   - "No gift balance" state with top-up prompt when balance is 0

3. The `send_dm_gift` RPC call stays the same but now passes the selected emoji instead of always "🎁", and the amount comes from `EMOJI_PRICES[emoji]`

4. Remove the custom amount `Input` and dollar preset buttons entirely

### No database changes needed
The `send_dm_gift` RPC already accepts `p_emoji` and `p_amount` parameters.

