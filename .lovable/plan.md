

## Enhance Support Ticket System

### Changes

**1. Database Migration -- Add `category` column to `support_tickets`**

```sql
ALTER TABLE public.support_tickets
ADD COLUMN category text NOT NULL DEFAULT 'general';
```

No new table needed -- just one column addition.

**2. Update chat rules: only `closed` locks the chat**

Currently `SupportChat.tsx` blocks messaging when status is `closed` OR `resolved`. Change this so only `closed` permanently locks the conversation. `resolved` tickets remain open for continued messaging (admin can re-open or user can follow up).

**3. Admin `is_staff` detection in `SupportChat`**

Currently `is_staff` is hardcoded to `false` in `sendMessage`. Add a prop `isStaff?: boolean` to `SupportChat` so `AdminSupport` can pass `isStaff={true}`, and the insert uses that value. This lets admin/support/moderator replies show as staff messages.

**4. Complaint category picker in `SupportTab.tsx`**

Replace the free-text "Subject" input with a category selector + optional subject. Categories:

| Value | Label |
|-------|-------|
| `withdrawal` | Withdrawal Issue |
| `deposit` | Deposit Issue |
| `quick_trade` | Quick Trade Issue |
| `prediction` | Prediction Market Issue |
| `account` | Account / Profile Issue |
| `kyc` | KYC / Verification |
| `copy_trade` | Copy Trading Issue |
| `technical` | Technical / Bug Report |
| `general` | Other / General |

The category is saved on the ticket and displayed as a badge in both user and admin ticket lists.

**5. Show category badge in `AdminSupport.tsx`**

Display the category alongside the status badge so staff can quickly triage.

### Files Changed

| File | Change |
|------|--------|
| Migration SQL | Add `category` column to `support_tickets` |
| `src/components/chat/SupportTab.tsx` | Add category selector dropdown, save category on ticket, show category badge in list |
| `src/components/chat/SupportChat.tsx` | Accept `isStaff` prop, use it in insert; change closed check to only `status === 'closed'` |
| `src/pages/admin/AdminSupport.tsx` | Pass `isStaff={true}` to `SupportChat`; show category badge on ticket cards |

