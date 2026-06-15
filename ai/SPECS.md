# Meeting Notes MCP Server — Specification

## 1. Overview

A self-hosted Model Context Protocol (MCP) server that stores meeting notes (manual input or transcription) and answers natural-language questions about past meetings via an AI chat interface. The server exposes tools to add, search, retrieve, and summarize meetings. Clients (e.g., Claude Desktop, Cursor) interact with it through the MCP protocol—no custom frontend is required.

## 2. Goals

- Store meeting notes with structured metadata (title, date, participants, tags, content).
- Support semantic search so users can ask questions like: *"What did we decide about pricing last week?"*
- Automatically generate summaries on demand.
- Run entirely self-hosted except for calls to external embedding/LLM APIs.
- Be usable from any MCP-compatible client via chat.

## 3. Non-Goals

- Real-time meeting transcription (transcripts are provided as external input).
- A custom web/mobile UI.
- Multi-user support or access control (personal use only).
- Calendar integration or automated scheduling.

## 4. Architecture

### 4.1 High-Level Diagram

```
┌─────────────────┐
│  MCP Client     │  Claude Desktop, Cursor, etc.
│ (Chat Interface)│
└────────┬────────┘
         │ MCP Protocol (stdio / SSE)
         ▼
┌─────────────────────────────┐
│  Meeting Notes MCP Server   │  TypeScript
│                             │  - MCP SDK
│  - Tool handlers            │  - better-sqlite3
│  - RAG pipeline             │  - sqlite-vec
│  - OpenRouter client        │
└────────┬────────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐  ┌──────────────────────┐
│ SQLite │  │ OpenRouter API       │
│ +      │  │ /api/v1/embeddings   │
│ vectors│  │ /api/v1/chat/completions
└────────┘  └──────────────────────┘
```

### 4.2 Components

| Component | Responsibility |
|-----------|--------------|
| **MCP Server** | Handles MCP lifecycle, exposes tools, processes requests. |
| **Storage Layer** | SQLite database for meetings metadata; `sqlite-vec` virtual table for vector embeddings. |
| **Embedding Service** | Calls OpenRouter (or OpenAI-compatible) `/embeddings` endpoint to convert text into dense vectors. |
| **RAG Pipeline** | 1. Embed the user’s question. 2. Query the vector table for the top-k closest meeting embeddings. 3. Inject retrieved meeting content as context into an LLM prompt. 4. Return the generated answer. |
| **Summarizer** | Sends meeting content to an LLM (via OpenRouter) and returns a summary in the requested style. |

### 4.3 Data Flow — Ask a Question

1. Client sends a chat message: *"What did Alice say about the roadmap?"*
2. MCP Server receives the request through an MCP tool (e.g., `ask_meetings`).
3. Server embeds the question using the Embedding Service.
4. Server queries the SQLite vector table for the most semantically similar meetings.
5. Server builds a prompt containing the retrieved meeting excerpts + the user’s question.
6. Server calls the LLM (via OpenRouter) to synthesize an answer.
7. Server returns the answer to the client.

### 4.4 Data Flow — Add Meeting Notes

1. Client calls the `add_meeting` tool with title, date, participants, tags, and content.
2. Server stores metadata in the `meetings` table.
3. Server embeds the full meeting content via the Embedding Service.
4. Server inserts the resulting vector into the `meeting_embeddings` virtual table.
5. Server confirms the meeting was saved.

## 5. Data Model (Conceptual)

### 5.1 Meetings
- `id` — unique identifier
- `title` — meeting title
- `date` — ISO 8601 date string
- `participants` — list of attendee names
- `tags` — user-defined or auto-generated labels
- `content` — full notes or transcript text
- `summary` — optional cached summary
- `created_at` — timestamp

### 5.2 Meeting Embeddings
- `meeting_id` — foreign key to meetings
- `embedding` — high-dimensional float vector (e.g., 1536-dim)
- Virtual table managed by `sqlite-vec`

## 6. MCP Tools (Surface Area)

The server exposes the following tools to clients:

| Tool | Purpose |
|------|---------|
| `add_meeting` | Persist new meeting notes and generate/store their embedding. |
| `get_meeting` | Retrieve a single meeting by ID. |
| `list_meetings` | List meetings with optional filters (date range, participant, tag). |
| `search_meetings` | Semantic search across meeting content; returns ranked matches. |
| `summarize_meeting` | Generate a summary of a specific meeting in a chosen style (brief, detailed, bullets). |
| `ask_meetings` | Answer natural-language questions by retrieving relevant meetings and synthesizing a response via LLM (RAG). |

## 7. External Dependencies

| Service | Usage | Required |
|---------|-------|----------|
| **OpenRouter** | Embeddings (`/embeddings`) and chat completions (`/chat/completions`). | Yes |
| **Node.js + npm** | Runtime and package manager for the TypeScript server. | Yes |
| **SQLite** | Local file-based relational + vector database. | Yes |

## 8. Configuration

The server reads configuration from environment variables or a local config file:

- `OPENROUTER_API_KEY` — authentication for OpenRouter.
- `DATABASE_PATH` — path to the SQLite file (default: `./data/meetings.db`).
- `EMBEDDING_MODEL` — model ID for embeddings (default: `openai/text-embedding-3-small`).
- `CHAT_MODEL` — model ID for chat completions / summarization (default: `anthropic/claude-sonnet-4` or similar).
- `MAX_CONTEXT_MEETINGS` — number of meetings to retrieve for RAG (default: 5).

## 9. Constraints & Considerations

- **Self-hosted scope** — All data lives locally on the user's machine; only API calls leave the host.
- **Optional authentication** — Single-user personal use with optional Bearer token auth for HTTP transport. stdio transport requires no authentication.
- **MCP transport** — Initially stdio (for Claude Desktop); SSE can be added later for remote clients.
- **Embedding consistency** — The same model must be used for all embeddings to keep the vector space compatible.
- **Backups** — Users are responsible for backing up the SQLite database file.

## 10. Authentication (Optional)

The HTTP transport (`src/http-server.ts`) supports optional Bearer token authentication. When enabled, all MCP endpoints require a valid JWT in the `Authorization: Bearer <token>` header.

### 10.1 Enabling Authentication

Set **all three** environment variables in `.env`:

```env
MCP_USERNAME=admin
MCP_PASSWORD=changeme
JWT_SECRET=your-super-secret-jwt-key-min-32-characters-long
```

> **Note:** If any of the three variables is missing, authentication is **disabled** and the server behaves exactly as before.

### 10.2 Obtaining a Token

Send a `POST` request to `/auth/token` with username and password:

```bash
curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme"}'
```

**Success response (200):**
```json
{ "token": "eyJhbGciOiJIUzI1NiIs..." }
```

**Failure response (401):**
```json
{ "error": "Unauthorized: invalid credentials" }
```

### 10.3 Using the Token

Include the token in the `Authorization` header for all MCP endpoint requests:

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{...}}'
```

### 10.4 Token Properties

- **Algorithm:** HS256
- **Expiry:** 30 days
- **Subject (`sub`):** username of the authenticated user
- **Validation:** Tokens are verified against `JWT_SECRET` with a 60-second clock tolerance

### 10.5 Conditional Enablement

The auth middleware in `src/auth/middleware.ts` checks whether `MCP_USERNAME`, `MCP_PASSWORD`, and `JWT_SECRET` are all configured. If any is missing:

- `requireAuth` calls `next()` immediately (no 401)
- The `/auth/token` endpoint still exists but returns 401 for all requests (since credentials are not configured)
- stdio transport is completely unaffected
