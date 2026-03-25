

# Update Developer Documentation to Align with Platform

## Current State
The documentation page at `/developers` is largely accurate. After reviewing the API (`api-public`), SDK (`sdk-js`), webhook dispatcher, WordPress plugin, and embed routes, there is one undocumented API endpoint and a few minor improvements needed.

## Changes to `src/pages/Developers.tsx`

### 1. Add missing `embed-data` endpoint to API Endpoints section
The `embed-data` action is a public endpoint (no API key required) that returns market data for embed widgets. It should be documented between the `positions` and `place-bet` endpoints:
- **Method**: GET
- **Action**: `embed-data`
- **Params**: `id (required)`
- **Note**: Public — no API key needed
- **Response**: `{ "market": { ... } }`

### 2. Add `embed-data` to the SDK section note
Add a note under the Embed Widgets section that the embed data endpoint is publicly accessible without an API key, making it suitable for server-side rendering of market previews.

### 3. Update version reference in header
Add a version badge or note (e.g., "API v1.0") to the header area for clarity.

### 4. Add error response documentation
Add a small section or callout under Authentication showing the standard error response format:
```json
{ "error": "Error message here" }
```
With common HTTP status codes: 400, 401, 403, 404, 429, 500, 503.

### 5. Add feature toggle note
Document that the public API can be disabled via a feature toggle (`public_api`), which returns `503 Service Unavailable`.

## Files Modified
- `src/pages/Developers.tsx` — Add missing endpoint, error docs, and feature toggle note

