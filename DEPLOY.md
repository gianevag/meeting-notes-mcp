# Deployment Guide

This guide covers deploying the Meeting Notes MCP server using Docker, Docker Compose, and CapRover.

## Table of Contents

- [Docker Compose (Local/VPS)](#docker-compose-localvps)
- [CapRover (Recommended for Easy Cloud Deploy)](#caprover-recommended-for-easy-cloud-deploy)
- [Environment Variables](#environment-variables)
- [Persistent Storage](#persistent-storage)
- [Troubleshooting](#troubleshooting)

---

## Docker Compose (Local/VPS)

The easiest way to run the server locally or on any VPS with Docker installed.

### Prerequisites

- Docker Engine >= 20.x
- Docker Compose >= 2.x

### Steps

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd meeting-notes-mcp
   ```

2. **Create configuration**

   ```bash
   cp .env.example .env
   ```

3. **Configure environment variables**

   Edit `.env` and add your OpenRouter API key:

   ```env
   OPENROUTER_API_KEY=sk-or-v1-your-key-here
   ```

   The default `DATABASE_PATH=/data/meetings.db` is already configured for Docker.

4. **Build and run**

   ```bash
   docker compose up -d
   ```

5. **Verify**

   ```bash
   docker compose logs -f
   ```

   The server will be available at `http://localhost:3000`.

### Stop

```bash
docker compose down
```

### Update

```bash
docker compose pull
docker compose up -d
```

---

## CapRover (Recommended for Easy Cloud Deploy)

[CapRover](https://caprover.com/) is an open-source PaaS that makes deploying Docker-based apps incredibly simple.

### Prerequisites

- A CapRover instance running (see [CapRover docs](https://caprover.com/docs/get-started.html))
- The `caprover` CLI tool installed (optional, for CLI deploys)

### Method 1: Deploy from Git Repository (Recommended)

1. **Create a new app** in the CapRover dashboard:
   - App Name: `meeting-notes` (or your preference)
   - Check **"Has Persistent Data"**

2. **Configure Persistent Directory**:
   - Go to **App Configs** → **Persistent Directories**
   - Click **Add Persistent Directory**
   - **Path in App**: `/data`
   - **Label**: `meeting-notes-data`
   - Click **Set & Update**

3. **Configure Environment Variables**:
   - Go to **App Configs** → **Environmental Variables**
   - Add the following variables:

     | Variable | Value | Required |
     |----------|-------|----------|
     | `OPENROUTER_API_KEY` | `sk-or-v1-your-key` | ✅ Yes |
     | `DATABASE_PATH` | `/data/meetings.db` | ✅ Yes |
     | `EMBEDDING_MODEL` | `openai/text-embedding-3-small` | ❌ No |
     | `CHAT_MODEL` | `anthropic/claude-sonnet-4-20250514` | ❌ No |
     | `MAX_CONTEXT_MEETINGS` | `5` | ❌ No |
     | `MCP_HTTP_PORT` | `3000` | ❌ No |
     | `MCP_USERNAME` | `admin` | ❌ No |
     | `MCP_PASSWORD` | `your-password` | ❌ No |
     | `JWT_SECRET` | `your-jwt-secret-min-32-chars` | ❌ No |

4. **Enable HTTPS** (recommended):
   - Go to **HTTP Settings**
   - Click **Enable HTTPS**
   - Enable **Force HTTPS** if desired

5. **Deploy**:
   - Go to **Deployment** → **Method 3: Deploy from Github/Bitbucket/Gitlab**
   - Enter your repository URL
   - Branch: `main`
   - CapRover will automatically detect the `captain-definition` file and build using the Dockerfile

6. **Verify Deployment**:
   - Go to **Deployment** → **Logs**
   - You should see the server starting up

### Method 2: Deploy using CLI

If you have the CapRover CLI installed:

```bash
# Login to your CapRover server (one-time setup)
caprover login -h https://captain.your-domain.com

# Deploy
caprover deploy -h https://captain.your-domain.com -a meeting-notes -b main
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | — | **Required.** Your OpenRouter API key |
| `DATABASE_PATH` | `/data/meetings.db` | SQLite database file path. Use `/data/meetings.db` for Docker/CapRover (persistent volume) |
| `EMBEDDING_MODEL` | `openai/text-embedding-3-small` | Model for generating embeddings |
| `CHAT_MODEL` | `anthropic/claude-sonnet-4-20250514` | Model for chat/summarization |
| `MAX_CONTEXT_MEETINGS` | `5` | Max meetings to include in RAG context |
| `MCP_HTTP_PORT` | `3000` | HTTP server port. CapRover auto-maps to 80/443 |
| `MCP_USERNAME` | — | Username for HTTP auth (optional) |
| `MCP_PASSWORD` | — | Password for HTTP auth (optional) |
| `JWT_SECRET` | — | JWT signing secret (required if auth enabled) |

---

## Persistent Storage

### Docker Compose

Data is persisted automatically using a Docker named volume `meeting-notes-data` mounted at `/data`.

```yaml
volumes:
  meeting-notes-data:
    driver: local
```

### CapRover

You **must** configure a persistent directory in the CapRover dashboard:

1. App Configs → Persistent Directories
2. Add directory with:
   - **Path in App**: `/data`
   - **Label**: `meeting-notes-data`

⚠️ **Important**: Without this, your database will be lost on every deploy or restart!

---

## Troubleshooting

### CapRover build fails with "out of memory"

The SQLite compilation may need more memory. Increase your CapRover instance swap or reduce build parallelism:

```dockerfile
# In Dockerfile, change:
RUN npm ci
# To:
RUN npm ci --maxsockets 1
```

### Database not persisting (CapRover)

1. Verify persistent directory is set to `/data`
2. Check `DATABASE_PATH` env var is set to `/data/meetings.db`
3. Redeploy after fixing

### Container exits immediately

Check logs in CapRover dashboard → Deployment → Logs. Common causes:
- Missing `OPENROUTER_API_KEY`
- `DATABASE_PATH` pointing to non-existent directory
- Port conflict (ensure `MCP_HTTP_PORT=3000`)

---

## Security Notes

- **Never commit `.env` to git**. It's already in `.gitignore`.
- Always use HTTPS in production (CapRover can auto-enable with Let's Encrypt).
- Enable authentication by setting `MCP_USERNAME`, `MCP_PASSWORD`, and `JWT_SECRET`.
