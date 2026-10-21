# Architecture rules

- Public commission settings use an explicit-column, read-only owner-executed view over the admin-only settings table, so creators can load eligibility configuration without gaining direct table access; preserve this boundary when extending settings.