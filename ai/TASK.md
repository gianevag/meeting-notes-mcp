# Meeting Notes MCP Server — Development Tasks

## How to Use This File

- **Status**: Mark as `Pending` → `In Progress` → `Completed` as work progresses
- **Dependencies**: Tasks that must be finished before starting this one
- **Verification**: How we confirm the task is done correctly

---

## Phase 1: Project Setup & Infrastructure

| # | Task | Status | Dependencies | Verification |
|---|------|--------|-------------|--------------|
| 1.1 | Initialize TypeScript Node.js project (`package.json`, `tsconfig.json`) | ✅ Completed | None | `npm init` ran, `tsconfig.json` configured |
| 1.2 | Install core dependencies (`@modelcontextprotocol/sdk`, `better-sqlite3`, `sqlite-vec`, `dotenv`) | ✅ Completed | 1.1 | `npm install` succeeds, `package-lock.json` generated |
| 1.3 | Set up directory structure (`src/config`, `src/db`, `src/services`, `src/tools`, `src/types`, `src/__tests__`) | ✅ Completed | 1.2 | All directories exist |
| 1.4 | Create `.env.example` with all configuration variables | ✅ Completed | 1.3 | File created and documented |
| 1.5 | Add `.gitignore` (node_modules, .env, data/*.db, *.log) | ✅ Completed | 1.3 | File created |

---

## Phase 2: Database Layer

| # | Task | Status | Dependencies | Verification |
|---|------|--------|-------------|--------------|
| 2.1 | Create SQLite schema (meetings table + meeting_embeddings virtual table via sqlite-vec) | ✅ Completed | 1.3 | SQL migration/initialization file created |
| 2.2 | Implement database initialization and connection manager | ✅ Completed | 2.1 | DB connects without errors |
| 2.3 | Create typed data access layer (CRUD operations for meetings) | ✅ Completed | 2.2 | CRUD ops tested manually via script |
| 2.4 | Handle sqlite-vec extension loading with better-sqlite3 | ✅ Completed | 2.1 | Extension loads successfully, no errors |

---

## Phase 3: Embedding Service & OpenRouter Configuration

| # | Task | Status | Dependencies | Verification |
|---|------|--------|-------------|--------------|
| 3.1 | Create OpenRouter API client/service | ✅ Completed | 1.2 | Client module created with configurable base URL |
| 3.2 | Implement embedding endpoint (`POST /api/v1/embeddings`) | ✅ Completed | 3.1 | Can convert text to vector array |
| 3.3 | Store and retrieve embeddings from sqlite-vec | ✅ Completed | 3.2, 2.4 | Embeddings persist and can be queried |
| 3.4 | Make embedding model configurable via environment variables | ✅ Completed | 3.2 | Default: `openai/text-embedding-3-small` |

---

## Phase 4: Error Handling & Utilities

| # | Task | Status | Dependencies | Verification |
|---|------|--------|-------------|--------------|
| 4.1 | OpenRouter API retry logic with exponential backoff (max 3 retries) | ✅ Completed | 3.1 | Retries work on simulated failure |
| 4.2 | SQLite error handling wrapper (connection, query, constraint errors) | ✅ Completed | 2.2 | Errors return user-friendly messages |
| 4.3 | Input validation utilities for all MCP tool parameters (Zod schemas) | ✅ Completed | 1.3 | Invalid inputs rejected with clear errors |
| 4.4 | Graceful degradation (return empty results instead of crashing) | ✅ Completed | 4.2, 4.3 | Server stays alive on all errors |
| 4.5 | Logging utility (structured logs to stdout/stderr) | ✅ Completed | 1.3 | Logs visible in MCP client |

---

## Phase 5: MCP Server Foundation

| # | Task | Status | Dependencies | Verification |
|---|------|--------|-------------|--------------|
| 5.1 | Initialize MCP server with stdio transport | Completed | 1.2 | Server starts without errors |
| 5.2 | Define all 6 tool schemas with Zod validation | Completed | 4.3 | All tools from SPECS.md defined |
| 5.3 | Set up tool registration framework | Completed | 5.2 | Tools registered dynamically |
| 5.4 | Implement health check / ping response | Completed | 5.1 | Server responds to basic initialization |

---

## Phase 6: MCP Tool Implementation

| # | Task | Status | Dependencies | Verification |
|---|------|--------|-------------|--------------|
| 6.1 | `add_meeting` — Store meeting metadata and generate/store embedding | ✅ Completed | 5.3, 3.3 | Meeting added, embedding exists in DB |
| 6.2 | `get_meeting` — Retrieve a single meeting by ID | ✅ Completed | 6.1 | Returns correct meeting data |
| 6.3 | `list_meetings` — Filter meetings by date range, participant, or tag | ✅ Completed | 6.1 | Filtering returns correct results |
| 6.4 | `search_meetings` — Semantic similarity search via vector comparison | ✅ Completed | 6.1 | Returns relevant meetings for query |
| 6.5 | `summarize_meeting` — LLM-powered summary generation (brief/detailed/bullet) | ✅ Completed | 6.1, 3.1 | Summary generated in requested style |
| 6.6 | `ask_meetings` — Full RAG pipeline (embed question → vector search → LLM context synthesis → answer) | ✅ Completed | 6.4, 6.5 | Answers based on stored meeting context |

---

## Phase 7: Testing (Jest)

| # | Task | Status | Dependencies | Verification |
|---|------|--------|-------------|--------------|
| 7.1 | Install and configure Jest + ts-jest + @types/jest | ✅ Completed | 1.1 | `jest.config.js` created, tests run |
| 7.2 | Write unit tests for database operations (CRUD, schema) | ✅ Completed | 2.3, 7.1 | All DB tests pass |
| 7.3 | Write unit tests for OpenRouter client with mocked API responses | ✅ Completed | 3.1, 7.1 | Mocked tests pass |
| 7.4 | Write unit tests for embedding service | ✅ Completed | 3.2, 7.1 | Embedding tests pass |
| 7.5 | Write integration tests for all 6 MCP tools individually | ✅ Completed | 6.6, 7.1 | Tool tests pass |
| 7.6 | Write E2E test for complete RAG pipeline | ✅ Completed | 6.6, 7.5 | Full flow test passes |

---

## Phase 8: Verification & Final Checks

| # | Task | Status | Dependencies | Verification |
|---|------|--------|-------------|--------------|
| 8.1 | Manual E2E test: Add sample meeting → Search → Ask question | ✅ Completed | 6.6 | E2E test covers full flow in `e2e-rag.test.ts` |
| 8.2 | Verify semantic search returns relevant results | ✅ Completed | 6.4 | `search_meetings` tool tests verify contextual relevance |
| 8.3 | Verify RAG answers accurately cite stored meetings | ✅ Completed | 6.6 | E2E tests validate answers reference correct meeting data |
| 8.4 | Run full Jest test suite — all tests green | ✅ Completed | 7.6 | `npm test` passes: **174/174 tests passed** |
| 8.5 | Code cleanup: remove unused imports, ensure consistent logging & error messages | ✅ Completed | All above | TypeScript compiles with `--noEmit`, clean codebase |

---

## Phase 9: Authentication (Optional Bearer Token)

| # | Task | Status | Dependencies | Verification |
|---|------|--------|-------------|--------------|
| 9.1 | Install `jose` library for JWT signing and verification | ✅ Completed | None | `npm install jose` succeeds, `jose` appears in `package.json` dependencies |
| 9.2 | Add auth env vars to `.env.example` (`MCP_USERNAME`, `MCP_PASSWORD`, `JWT_SECRET`) | ✅ Completed | None | File updated with descriptions and examples |
| 9.3 | Update `src/types/meeting.ts` — extend `AppConfig` with optional auth fields | ✅ Completed | None | `AppConfig` includes `mcpUsername?`, `mcpPassword?`, `jwtSecret?` |
| 9.4 | Update `src/config/index.ts` — load auth env vars (optional, no validation errors if missing) | ✅ Completed | 9.3 | `getConfig()` returns auth fields when present; works without them |
| 9.5 | Create `src/auth/token.ts` — JWT creation + verification functions | ✅ Completed | 9.4 | Returns signed JWT with `sub: username`, 30-day `exp`; returns `null` on invalid/expired |
| 9.6 | Create `src/auth/middleware.ts` — Express `requireAuth` middleware | ✅ Completed | 9.5 | Reads `Authorization: Bearer <token>`; calls `next()` on success; sends 401 on failure |
| 9.7 | Make middleware conditional — skip auth when env vars are absent | ✅ Completed | 9.4, 9.6 | Middleware calls `next()` immediately when auth env vars are missing |
| 9.8 | Add `POST /auth/token` endpoint to `src/http-server.ts` | ✅ Completed | 9.5 | Accepts `{ username, password }`; returns `{ token }` on match; 401 on mismatch |
| 9.9 | Protect `POST /mcp`, `GET /mcp`, `DELETE /mcp` with auth middleware | ✅ Completed | 9.7 | All MCP endpoints require valid token when auth is enabled |
| 9.10 | Return `WWW-Authenticate: Bearer` header on 401 responses | ✅ Completed | 9.9 | All 401 responses include proper header per RFC 6750 |
| 9.11 | Ensure stdio transport (`src/server.ts`) remains completely unchanged | ✅ Completed | None | `src/server.ts` diff shows zero changes |
| 9.12 | Update `src/__tests__/server.test.ts` — mock auth config to keep existing tests passing | ✅ Completed | None | All existing tests still pass after auth changes |
| 9.13 | Create `src/__tests__/auth.test.ts` — comprehensive auth endpoint & middleware tests | ✅ Completed | 9.8 | Tests cover: valid/invalid credentials, missing fields, protected endpoints, backward compatibility |
| 9.14 | Run full Jest test suite — all existing + new tests pass | ✅ Completed | 9.12, 9.13 | `npm test` passes: **189/189 tests passed** |
| 9.15 | Update `ai/SPECS.md` — add Authentication section | ✅ Completed | 9.10 | Section covers env vars, token endpoint, header format, conditional enablement |
| 9.16 | Update `ai/TASK.md` — add Phase 9 for Authentication | ✅ Completed | 9.15 | Auth phase added, all tasks marked ✅ |
| 9.17 | Update `README.md` — explain how to enable auth and obtain a token | ✅ Completed | 9.15 | Includes curl example for `POST /auth/token` and usage with MCP endpoints |
| 9.18 | Run `npm run build` — TypeScript compiles with no errors | ✅ Completed | 9.14 | `tsc` exits 0, no type errors in new or existing code |

---

## Quick Reference

### Technologies
- **Runtime**: Node.js + TypeScript
- **Database**: SQLite + sqlite-vec (vector extension)
- **MCP Framework**: @modelcontextprotocol/sdk
- **Testing**: Jest + ts-jest
- **Validation**: Zod
- **External API**: OpenRouter (embeddings + chat completions)

### Key Files to Create
```
├── src/
│   ├── config/           # Environment and configuration
│   ├── db/               # Database schema and connection
│   ├── services/         # OpenRouter client, embedding service
│   ├── tools/            # MCP tool implementations (6 tools)
│   ├── types/            # TypeScript interfaces and types
│   └── __tests__/        # Jest test files
├── ai/
│   ├── SPECS.md          # Project specification
│   ├── TASK.md           # This file
│   └── SETUP.md          # Client configuration guide
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── jest.config.js
```

### Configuration Variables (see `.env.example`)
| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | — | Your OpenRouter API key |
| `DATABASE_PATH` | `./data/meetings.db` | Path to SQLite database file |
| `EMBEDDING_MODEL` | `openai/text-embedding-3-small` | Model for generating embeddings |
| `CHAT_MODEL` | — | Model for chat completions / summarization |
| `MAX_CONTEXT_MEETINGS` | `5` | Number of meetings to retrieve for RAG |

---

## Status Legend

- ⬜ **Pending** — Not started yet
- 🔄 **In Progress** — Currently being worked on
- ✅ **Completed** — Done and verified
