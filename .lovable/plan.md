

# Export Resolved Markets (PDF, Excel, CSV)

## Overview
Add an export dropdown button on the resolved markets tab allowing super admins to download the data as PDF, Excel, or CSV. Each export includes market title, category, volume, participants, end date, resolved side/winning option, and blockchain hash (as a BSCScan link).

## Changes

### `src/pages/admin/AdminMarkets.tsx`
1. Add a `Download` (lucide) icon button with a dropdown menu (PDF, Excel, CSV) — visible only when `isSuperAdmin` and filter is `resolved` (or always visible but exports only resolved markets).
2. Implement three export handlers:

**CSV**: Build a CSV string from the resolved markets array, create a Blob and trigger download via `URL.createObjectURL`.

**Excel**: Use the same CSV approach but with `.xls` extension and `application/vnd.ms-excel` MIME type (lightweight, no library needed). Alternatively use a simple HTML table exported as `.xls`.

**PDF**: Generate a printable HTML table in a new window and call `window.print()` for PDF output, or use a simple approach with `jsPDF` + `jspdf-autotable` (would need adding the dependency).

3. Export columns: Title, Category, Type, Volume, Participants, End Date, Resolved Side, Blockchain TX Hash (full URL).

### Dependencies
- For PDF: use browser `window.print()` on a styled HTML table (no extra dependency needed). This opens the system print dialog where the user can save as PDF.
- For Excel/CSV: pure JS, no dependencies.

### Data source
Use the already-fetched `markets` array filtered to `status === "resolved"`.

## Files Modified
- `src/pages/admin/AdminMarkets.tsx` — add export dropdown and handlers

