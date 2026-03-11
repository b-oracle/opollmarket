

## Change Dropdown Arrow Color to Blue

### What Changes
Update the inline SVG chevron used in the crypto selector `<select>` to use a blue/primary color instead of black, making it more noticeable.

### Implementation
**File**: `src/components/DepositWithdrawModal.tsx` (line 619)

Change the `stroke` color in the inline SVG data URI from `'currentColor'` to the primary blue hex (matching the app's primary color). The SVG is embedded in the `backgroundImage` CSS property of the `<select>` element's `style` attribute.

The current stroke is `currentColor` (inherits text color, appears dark). Replace with an explicit blue like `%2360a5fa` (Tailwind blue-400) or the app's primary color to make the arrow stand out.

