

## Move Theme Toggle into Profile Dropdown Menu

### What changes
**`src/components/TopBar.tsx`**
- Remove `<ThemeToggle />` from the top bar action row (line 118)
- Add a theme toggle row inside the profile dropdown menu (between Profile and Sign Out), styled as a menu item with Sun/Moon icon and "Dark Mode" label + a switch/toggle on the right
- Import `useTheme` from `next-themes` directly in TopBar (or inline the toggle logic) so it renders as a menu row with a switch, not a standalone button
- For logged-out users, keep `<ThemeToggle />` visible in the top bar since they don't have a dropdown menu

### UX Result
```text
Dropdown menu (logged in):
┌──────────────────────┐
│ BOracle              │
│ icecuetech@gmail.com │
├──────────────────────┤
│ 👤 Profile           │
│ 🌙 Dark Mode    [⬤] │  ← toggle switch
│ 🚪 Sign Out          │
└──────────────────────┘
```

### No other files need changes
The `ThemeToggle` component can remain for reuse, but the dropdown will use inline `useTheme` logic with a Switch component for a cleaner menu-item look.

