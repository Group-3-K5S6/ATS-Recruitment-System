# Account and session API gateway

This small Node.js service exposes account lock, unlock, and session-revocation operations next to the existing `be` and `fe` projects. It forwards the caller's Bearer token to the ATS backend, where authentication, Admin permission checks, audit logging, and database updates happen.

Run the main ATS backend first (`cd be; npm run dev`), then run this gateway from `be/account-session-api` (`npm install; npm run dev`). The frontend Vite server proxies `/account-api` to this service.

Routes:

- `PATCH /api/users/:id/disable` — lock the account and revoke its sessions.
- `PATCH /api/users/:id/enable` — unlock the account; old sessions remain revoked.
- `POST /api/users/:id/revoke-sessions` — revoke all access and refresh tokens for the account.

Set `ACCOUNT_API_PORT` (default `4100`) or `ATS_BACKEND_URL` (default `http://localhost:4000`) to change the service addresses.
