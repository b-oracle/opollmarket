

## Improve Gift Notification with Sender Info

### Problem
The gift notification already includes the sender's name in the message text, but:
1. The `actor_id` field is not set, so tapping the notification doesn't navigate to the sender's profile.
2. The `gift` type has no icon/color config in the notification bell — it falls back to a generic info icon.
3. Gift notifications don't include a Telegram relay call.

### Changes

**File: `supabase/functions/send-space-gift/index.ts`**
- Add `actor_id: senderId` to the notification insert so the bell can deep-link to the sender's profile.
- Add a Telegram notification relay call (invoke `telegram-notify`) after inserting the notification.

**File: `src/components/NotificationBell.tsx`**
- Add `gift` to the `typeConfig` map with a gift-appropriate icon (e.g. `Gift` from lucide) and color class.
- Add a handler in `handleClick` for gift-type notifications: if `actor_id` is set, navigate to `/user/${actor_id}`.

### Technical details

Edge function notification insert change:
```ts
await adminClient.from("notifications").insert({
  user_id: recipientId,
  title: "Gift Received! 🎁",
  message: `${senderName} sent you ${emoji} ($${Number(amount).toFixed(2)})`,
  type: "gift",
  actor_id: senderId,  // <-- ADD THIS
});
```

NotificationBell typeConfig addition:
```ts
gift: { icon: Gift, colorClass: "text-primary bg-primary/10" },
```

handleClick addition for gift type:
```ts
if (n.type === "gift" && n.actor_id) {
  setOpen(false);
  navigate(`/user/${n.actor_id}`);
  return;
}
```

