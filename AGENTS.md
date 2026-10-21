# Architecture rules

- Public commission settings use an explicit-column, read-only owner-executed view over the admin-only settings table, so creators can load eligibility configuration without gaining direct table access; preserve this boundary when extending settings.
- First-prediction submissions use the dedicated quote-and-submit helper to fetch the selected option or binary side's current price before invoking place-bet; this avoids fixed-price rejections without weakening server validation.