# ATS Role Management API

Standalone Node.js service for the existing ATS database. It reuses the Prisma schema, generated client, and SQLite database in `be/prisma`, and verifies access tokens using the same `JWT_SECRET` as the main backend.

## Start

From this folder, install dependencies, generate the Prisma client, copy `.env.example` to `.env`, and start the service:

```powershell
npm install
npm run generate
npm run build
npm run dev
```

Start the main backend from `be` as well; its `/api/auth/login` endpoint runs on port `4000` by default. The role management service runs separately on port `4001`.

Set `JWT_SECRET` to the exact value configured for `be`. The service listens on port `4001` by default. The frontend uses `VITE_ROLE_API_URL` or `http://localhost:4001`.

## Endpoints

- `GET /api/role-management/roles` — available role codes.
- `GET /api/role-management/users` — users and current role assignments.
- `POST /api/role-management/users/:userId/roles` with `{ "role": "RECRUITER" }` — assign a role.
- `DELETE /api/role-management/users/:userId/roles/:role` — revoke one role.

All endpoints require `Authorization: Bearer <accessToken>` and an active Admin account. Role changes are recorded in the shared audit log. The API prevents an Admin from removing their own Admin role or revoking the last active Admin role.
