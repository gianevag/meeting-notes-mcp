# Meeting Notes MCP Server

A self-hosted [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for storing, searching, and querying meeting notes with **semantic search** and **RAG (Retrieval-Augmented Generation)** capabilities using SQLite + OpenRouter.

---

## Description

This MCP server provides a complete meeting notes management system with the following capabilities:

- **Store meeting notes** with title, date, participants, tags, and full content
- **Semantic search** using vector embeddings (sqlite-vec) to find meetings by meaning, not just keywords
- **RAG-powered Q&A** — Ask natural-language questions about your meetings and get contextually accurate answers
- **AI summaries** — Generate brief, detailed, or bullet-point summaries of any meeting
- **Flexible filtering** — Filter meetings by date range, participant, or tag
- **Persistent storage** — All data is stored in SQLite with vector embeddings

### Built With

| Component | Technology |
|-----------|------------|
| Runtime | Node.js + TypeScript |
| Database | SQLite + `sqlite-vec` (vector extension) |
| MCP Framework | `@modelcontextprotocol/sdk` |
| AI API | OpenRouter (embeddings + chat completions) |
| Validation | Zod |
| Testing | Jest + ts-jest |

---

## Installation

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** or **yarn**

### Steps

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd meeting-notes-mcp
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Create configuration file**

   ```bash
   cp .env.example .env
   ```

4. **Configure your environment variables**

   Edit `.env` and add your [OpenRouter API key](https://openrouter.ai/keys):

   ```env
   OPENROUTER_API_KEY=sk-or-v1-your-key-here
   ```

   Optional overrides:
   ```env
   DATABASE_PATH=./data/meetings.db
   EMBEDDING_MODEL=openai/text-embedding-3-small
   CHAT_MODEL=anthropic/claude-sonnet-4-20250514
   MAX_CONTEXT_MEETINGS=5
   ```

   Optional authentication (HTTP mode only):
   ```env
   MCP_USERNAME=admin
   MCP_PASSWORD=changeme
   JWT_SECRET=your-super-secret-jwt-key-min-32-chars-long
   ```

   > **Note:** If any of the three auth variables is missing, authentication is **disabled** and the server behaves exactly as before. The stdio transport is never affected.

5. **Build the project**

   ```bash
   npm run build
   ```

### Docker Deployment (Recommended for VPS)

Deploy the server as a Docker container — ideal for VPS or remote servers.

📖 **For detailed deployment instructions (including CapRover), see [`DEPLOY.md`](DEPLOY.md).**

#### Prerequisites

- **Docker** & **Docker Compose** installed on your VPS

#### Build & Run with Docker

1. **Build the image**

   ```bash
   docker build -t meeting-notes-mcp .
   ```

2. **Run the container**

    ```bash
    docker run -d \
      --name meeting-notes-mcp \
      -p 3000:3000 \
      -e OPENROUTER_API_KEY=sk-or-v1-your-key-here \
      -e MCP_HTTP_PORT=3000 \
      -e MCP_USERNAME=admin \
      -e MCP_PASSWORD=changeme \
      -e JWT_SECRET=your-super-secret-jwt-key-min-32-chars-long \
      -v meeting-notes-data:/data \
      meeting-notes-mcp
    ```

    - `-p 3000:3000` — Exposes the MCP HTTP server on port 3000
    - `-e OPENROUTER_API_KEY=...` — Required API key
    - `-e MCP_HTTP_PORT=3000` — Enables HTTP mode (without this, it runs stdio)
    - `-e MCP_USERNAME`, `-e MCP_PASSWORD`, `-e JWT_SECRET` — Optional auth credentials (omit to disable)
    - `-v meeting-notes-data:/data` — Persists the SQLite database in a Docker volume

3. **Verify it's running**

   ```bash
   docker logs meeting-notes-mcp
   ```

   You should see: `Meeting Notes MCP HTTP Server listening on http://0.0.0.0:3000/mcp`

#### Docker Compose ( easiest )

Create a `docker-compose.yml`:

```yaml
services:
  meeting-notes:
    build: .
    container_name: meeting-notes-mcp
    ports:
      - "3000:3000"
    environment:
      - OPENROUTER_API_KEY=sk-or-v1-your-key-here
      - MCP_HTTP_PORT=3000
      - DATABASE_PATH=/data/meetings.db
      - EMBEDDING_MODEL=openai/text-embedding-3-small
      - CHAT_MODEL=anthropic/claude-sonnet-4-20250514
      # Optional authentication (uncomment to enable)
      # - MCP_USERNAME=admin
      # - MCP_PASSWORD=changeme
      # - JWT_SECRET=your-super-secret-jwt-key-min-32-chars-long
    volumes:
      - meeting-notes-data:/data
    restart: unless-stopped

volumes:
  meeting-notes-data:
```

Then run:

```bash
docker compose up -d
```

---

## Usage

### Running the Server

#### Stdio Mode (default, for local MCP clients)

```bash
npm start
```

For development with auto-rebuild:

```bash
npm run dev
```

---

### MCP Client Configuration

#### Local Stdio Connection

Add the server to your MCP client configuration (e.g., Claude Desktop, Cursor, OpenCode):

```json
{
  "mcpServers": {
    "meeting-notes": {
      "type": "local",
      "command": ["node", "/your/path/meeting_notes_mcp/dist/index.js"],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-v1-your-key-here"
      }
    }
  }
}
```

#### Remote HTTP Connection with Authentication (Optional)

If authentication is enabled on the server (`MCP_USERNAME`, `MCP_PASSWORD`, `JWT_SECRET` set), you must first obtain a token and then include it in all requests.

**Step 1: Obtain a token**

```bash
curl -X POST http://your-vps-ip:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme"}'
```

Response:
```json
{ "token": "eyJhbGciOiJIUzI1NiIs..." }
```

**Step 2: Configure your MCP client with the token**

```json
{
  "mcpServers": {
    "meeting-notes": {
      "type": "remote"
      "url": "http://your-vps-ip:3000/mcp",
      "headers": {
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIs..."
      }
    }
  }
}
```

**Replace `your-vps-ip`** with your actual VPS IP address or domain.

> **Security Note:** For production, put the HTTP endpoint behind a reverse proxy (Nginx, Caddy, Traefik) with HTTPS. The built-in Bearer token authentication provides a lightweight protection layer for the MCP HTTP transport.

---

### Available MCP Tools

The server exposes **6 tools** for managing and querying meetings:

#### 1. `add_meeting`

Store a new meeting note. Automatically generates an embedding for semantic search.

**Example:**
```json
{
  "title": "Product Roadmap Q3",
  "date": "2025-07-15",
  "participants": ["Alice", "Bob", "Charlie"],
  "tags": ["product", "roadmap", "planning"],
  "content": "Discussed Q3 priorities: launch search improvements, mobile app redesign, and AI-powered recommendations. Alice will own the search project, Bob will handle mobile, and Charlie will prototype the AI features."
}
```

#### 2. `get_meeting`

Retrieve a meeting by its ID.

**Example:**
```json
{ "id": 1 }
```

#### 3. `list_meetings`

List meetings with optional filters.

**Example:**
```json
{
  "startDate": "2025-07-01",
  "endDate": "2025-07-31",
  "participant": "Alice",
  "tag": "product"
}
```

#### 4. `search_meetings`

Find meetings semantically using natural language. Returns the most contextually relevant meetings.

**Example:**
```json
{
  "query": "mobile app redesign plans",
  "limit": 5
}
```

#### 5. `summarize_meeting`

Generate an AI-powered summary of a meeting.

**Example:**
```json
{
  "id": 1,
  "style": "bullets"
}
```

**Style options:** `brief`, `detailed`, `bullets`

#### 6. `ask_meetings`

Ask a natural-language question about your meetings using RAG.

**Example:**
```json
{
  "question": "Who is responsible for the mobile app redesign?",
  "maxMeetings": 5
}
```

The server embeds the question, finds similar meetings via vector search, and synthesizes an answer using the LLM.

---

## Testing

Run the full test suite (189 tests):

```bash
npm test
```

Run with coverage:

```bash
npm test -- --coverage
```

Watch mode for development:

```bash
npm run test:watch
```

---

## Project Structure

```
├── src/
│   ├── auth/                # JWT token creation and Express auth middleware
│   ├── config/              # Environment & configuration
│   ├── db/                  # Database schema, connection, and CRUD operations
│   ├── services/            # OpenRouter client, embedding service
│   ├── tools/               # MCP tool implementations (6 tools)
│   ├── types/               # TypeScript interfaces and types
│   ├── validations/         # Zod schemas for input validation
│   ├── utils/               # Logging, retry logic, error handling, graceful degradation
│   ├── server.ts            # Stdio MCP server startup
│   ├── http-server.ts       # Streamable HTTP MCP server startup
│   └── __tests__/           # Jest test files
├── ai/
│   ├── SPECS.md             # Project specification
│   ├── TASK.md              # Development task tracker
│   └── SETUP.md             # Client configuration guide
├── captain-definition       # CapRover deployment config
├── .env.example             # Environment variable template
├── Dockerfile               # Docker image for VPS deployment
├── docker-compose.yml       # (Optional) Docker Compose setup
├── .gitignore
├── package.json
├── tsconfig.json
└── jest.config.js
```

---

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | — | Your [OpenRouter API key](https://openrouter.ai/keys) |
| `DATABASE_PATH` | `./data/meetings.db` | Path to SQLite database |
| `EMBEDDING_MODEL` | `openai/text-embedding-3-small` | Model for vector embeddings |
| `CHAT_MODEL` | `anthropic/claude-sonnet-4-20250514` | Model for summarization & RAG answers |
| `MAX_CONTEXT_MEETINGS` | `5` | Meetings retrieved for RAG context |
| `MCP_HTTP_PORT` | — | Set to enable HTTP mode (e.g., `3000`) |
| `LOG_LEVEL` | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |
| `MCP_USERNAME` | — | Single allowed username (optional, enables auth) |
| `MCP_PASSWORD` | — | Password for the single user (optional, enables auth) |
| `JWT_SECRET` | — | Secret key for signing/verifying JWTs (optional, enables auth) |

---

## License

MIT
