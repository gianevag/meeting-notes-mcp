# Meeting Notes MCP Server — Authentication Tasks

## Overview

Add optional Bearer token authentication to the MCP HTTP server. The server supports a single user with a single session. When authentication is enabled (via environment variables), all MCP endpoints require a valid JWT token in the `Authorization: Bearer <token>` header. A `POST /auth/token` endpoint allows the user to exchange username/password credentials (from `.env`) for a JWT token with a 30-day expiry.

**Scope:** This task covers only the HTTP transport (`src/http-server.ts`). The stdio transport remains unchanged and requires no authentication.

---

## How to Use This File

- **Status**: Mark as `Pending` → `In Progress` → `Completed` as work progresses
- **Dependencies**: Tasks that must be finished before starting this one
- **Verification**: How we confirm the task is done correctly

---

## Phase 1: Dependencies & Configuration

| # | Task | Status | Dependencies | Verification |
|---|---|---|---|---|
| 1.1 | Install `jose` library for JWT signing and verification | ✅ Completed | None | `npm install jose` succeeds, `jose` appears in `package.json` dependencies |
| 1.2 | Add auth env vars to `.env.example` (`MCP_USERNAME`, `MCP_PASSWORD`, `JWT_SECRET`) | ✅ Completed | None | File updated with descriptions and examples |
| 1.3 | Update `src/types/meeting.ts` — extend `AppConfig` with optional auth fields | ✅ Completed | None | `AppConfig` interface includes `mcpUsername?: string`, `mcpPassword?: string`, `jwtSecret?: string` |
| 1.4 | Update `src/config/index.ts` — load auth env vars (optional, no validation errors if missing) | ✅ Completed | 1.3 | `getConfig()` returns auth fields when present; works without them when absent |

---

## Phase 2: Token Generation & Verification

| # | Task | Status | Dependencies | Verification |
|---|---|---|---|---|
| 2.1 | Create `src/auth/token.ts` — JWT creation function `createToken(username: string)` | ✅ Completed | 1.4 | Returns a signed JWT string with `sub: username`, 30-day `exp` |
| 2.2 | Create `src/auth/token.ts` — JWT verification function `verifyToken(token: string)` | ✅ Completed | 2.1 | Returns decoded payload on valid token; returns `null` on expired, malformed, or invalid-signature tokens |
| 2.3 | Create `src/auth/middleware.ts` — Express middleware `requireAuth` | ✅ Completed | 2.2 | Reads `Authorization: Bearer <token>` header; calls `next()` on success; sends `401 Unauthorized` with JSON error on failure |
| 2.4 | Make middleware conditional — skip auth when `MCP_USERNAME`/`MCP_PASSWORD`/`JWT_SECRET` are not configured | ✅ Completed | 1.4, 2.3 | Middleware calls `next()` immediately when auth env vars are absent; no 401 returned |

---

## Phase 3: HTTP Server Endpoints

| # | Task | Status | Dependencies | Verification |
|---|---|---|---|---|
| 3.1 | Add `POST /auth/token` endpoint to `src/http-server.ts` | ✅ Completed | 2.1 | Accepts `{ username, password }` JSON body; returns `{ token: "<jwt>" }` on match; returns `401` on mismatch or missing body fields |
| 3.2 | Protect `POST /mcp` with auth middleware | ✅ Completed | 2.4, 3.1 | Requests without `Authorization: Bearer <token>` return `401` (when auth is enabled); initialize requests also require a token |
| 3.3 | Protect `GET /mcp` with auth middleware | ✅ Completed | 2.4 | Requests without valid token return `401` |
| 3.4 | Protect `DELETE /mcp` with auth middleware | ✅ Completed | 2.4 | Requests without valid token return `401` |
| 3.5 | Return proper `WWW-Authenticate: Bearer` header on 401 responses | ✅ Completed | 3.2–3.4 | All 401 responses include `WWW-Authenticate: Bearer` header per RFC 6750 |
| 3.6 | Ensure stdio transport (`src/server.ts`) remains completely unchanged | ✅ Completed | None | `src/server.ts` diff shows zero changes |

---

## Phase 4: Testing

| # | Task | Status | Dependencies | Verification |
|---|---|---|---|---|
| 4.1 | Update `src/__tests__/server.test.ts` — mock auth config to keep existing tests passing | ✅ Completed | None | All 174 existing tests still pass after auth changes |
| 4.2 | Create `src/__tests__/auth.test.ts` — test `POST /auth/token` with valid credentials | ✅ Completed | 3.1 | Returns 200 and a JWT token with `sub` matching username |
| 4.3 | Test `POST /auth/token` with invalid credentials | ✅ Completed | 3.1 | Returns 401 with error message |
| 4.4 | Test `POST /auth/token` with missing fields | ✅ Completed | 3.1 | Returns 400 or 401 with clear error |
| 4.5 | Test protected MCP endpoint without `Authorization` header | ✅ Completed | 3.2 | Returns 401 with `WWW-Authenticate: Bearer` |
| 4.6 | Test protected MCP endpoint with invalid token | ✅ Completed | 3.2 | Returns 401 |
| 4.7 | Test protected MCP endpoint with valid token | ✅ Completed | 3.2 | Returns expected MCP response (e.g., session initialization) |
| 4.8 | Test backward compatibility — server works without auth env vars | ✅ Completed | 2.4 | MCP endpoints return 200/204 without any `Authorization` header when auth is disabled |
| 4.9 | Run full Jest test suite — all tests green | ✅ Completed | 4.1–4.8 | `npm test` passes: **189/189 tests passed** (174 existing + 15 new auth tests) |

---

## Phase 5: Verification & Documentation

| # | Task | Status | Dependencies | Verification |
|---|---|---|---|---|
| 5.1 | Update `ai/SPECS.md` — add Authentication section describing the optional Bearer token flow | ✅ Completed | 3.4 | Section covers: env vars, token endpoint, header format, conditional enablement |
| 5.2 | Update `ai/TASK.md` — add new Phase 9 for Authentication with status markers | ✅ Completed | 5.1 | Auth phase added at the end, all tasks marked ✅ |
| 5.3 | Update `README.md` — explain how to enable auth and obtain a token | ✅ Completed | 5.1 | Includes curl example for `POST /auth/token` and how to use token with MCP endpoints |
| 5.4 | Manual verification: start server with auth enabled, obtain token via curl, use token to call `/mcp` | 🔄 In Progress | 4.9 | Server process management in progress |
| 5.5 | Manual verification: start server without auth env vars, confirm MCP endpoints work without token | ⬜ Pending | 4.9 | Backward compatibility confirmed manually |
| 5.6 | Run `npm run build` — TypeScript compiles with no errors | ✅ Completed | 4.9 | `tsc` exits 0, no type errors in new or existing code |

---

## Quick Reference

### Auth-Related Files to Create

```
src/
├── auth/
│   ├── token.ts          # JWT create + verify
│   └── middleware.ts     # Express auth middleware
└── __tests__/
    └── auth.test.ts      # Auth endpoint & middleware tests
```

### Auth-Related Files to Modify

```
package.json              # Add jose dependency
.env.example              # Add MCP_USERNAME, MCP_PASSWORD, JWT_SECRET
.env                      # Add auth vars for local dev
src/types/meeting.ts      # Extend AppConfig
src/config/index.ts         # Load auth env vars
src/http-server.ts        # Add /auth/token endpoint, protect /mcp routes
src/__tests__/server.test.ts  # Mock auth config
ai/SPECS.md               # Add auth section
ai/TASK.md                # Add Phase 9
README.md                 # Document auth setup
```

### Auth Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `MCP_USERNAME` | No (optional) | — | Single allowed username |
| `MCP_PASSWORD` | No (optional) | — | Password for the single user |
| `JWT_SECRET` | No (optional) | — | Secret key for signing/verifying JWTs |

> **Note:** If any of the three variables above is missing, authentication is **disabled** and the server behaves exactly as before.

### Token Endpoint

| Endpoint | Method | Body | Success | Failure |
|---|---|---|---|---|
| `/auth/token` | `POST` | `{ "username": "...", "password": "..." }` | `200 OK` + `{ "token": "<jwt>" }` | `401 Unauthorized` |

### MCP Endpoint Headers (when auth is enabled)

| Header | Value | Required |
|---|---|---|
| `Authorization` | `Bearer <jwt>` | Yes |
| `Mcp-Session-Id` | `<session-id>` | Yes (existing) |

---

## Status Legend

- ⬜ **Pending** — Not started yet
- 🔄 **In Progress** — Currently being worked on
- ✅ **Completed** — Done and verified
