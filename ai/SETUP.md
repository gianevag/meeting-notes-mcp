# Meeting Notes MCP Server — Client Setup Guide

This guide explains how to connect the Meeting Notes MCP Server to various AI clients.

## Prerequisites

- Node.js installed (v18 or higher recommended)
- The MCP server built and ready (`npm run build` or `npm start`)
- OpenRouter API key (get one at https://openrouter.ai)

---

## Configuration Overview

All clients use the same core configuration:

```json
{
  "mcpServers": {
    "meeting-notes": {
      "command": "node",
      "args": ["/absolute/path/to/your/meeting-notes-mcp/dist/index.js"],
      "env": {
        "OPENROUTER_API_KEY": "your-api-key-here",
        "DATABASE_PATH": "/absolute/path/to/your/data/meetings.db",
        "EMBEDDING_MODEL": "openai/text-embedding-3-small",
        "CHAT_MODEL": "anthropic/claude-sonnet-4",
        "MAX_CONTEXT_MEETINGS": "5"
      }
    }
  }
}
```

**Important**: Use absolute paths for both the server script and database location.

---

## 1. Claude Desktop

### Configuration File Location

| Operating System | Path |
|-----------------|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

### Setup Steps

1. Open or create the config file (it's JSON format)
2. Add the following configuration:

```json
{
  "mcpServers": {
    "meeting-notes": {
      "command": "node",
      "args": ["/Users/yourname/meeting-notes-mcp/dist/index.js"],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-v1-xxxxxxxxxx",
        "DATABASE_PATH": "/Users/yourname/meeting-notes-mcp/data/meetings.db"
      }
    }
  }
}
```

3. **Restart Claude Desktop** completely (quit and reopen)
4. The server will start automatically when Claude opens

### Verification

In Claude Desktop, you should see:
- A tool icon or reference to "meeting-notes" in the interface
- The ability to ask: "What did we discuss in the last meeting?"
- You can also check the MCP server logs for connection confirmation

---

## 2. GitHub Copilot (VS Code)

### Configuration Methods

GitHub Copilot in VS Code supports MCP through settings.

### Method A: VS Code Settings (JSON)

1. Open VS Code Settings (`Cmd/Ctrl + ,`)
2. Click the icon to open `settings.json`
3. Add the MCP configuration:

```json
{
  "mcp": {
    "servers": {
      "meeting-notes": {
        "command": "node",
        "args": ["/absolute/path/to/meeting-notes-mcp/dist/index.js"],
        "env": {
          "OPENROUTER_API_KEY": "sk-or-v1-xxxxxxxxxx",
          "DATABASE_PATH": "/absolute/path/to/meeting-notes-mcp/data/meetings.db"
        }
      }
    }
  }
}
```

### Method B: Workspace Settings

Create `.vscode/settings.json` in your project root:

```json
{
  "mcp": {
    "servers": {
      "meeting-notes": {
        "command": "node",
        "args": ["${workspaceFolder}/dist/index.js"],
        "env": {
          "OPENROUTER_API_KEY": "sk-or-v1-xxxxxxxxxx",
          "DATABASE_PATH": "${workspaceFolder}/data/meetings.db"
        }
      }
    }
  }
}
```

**Note**: `${workspaceFolder}` only works for Method B (workspace settings), not for global settings.

### Verification

- MCP tools should appear in Copilot Chat panel
- Try: `/mcp meeting-notes add_meeting` or ask about your meetings
- Check VS Code Output panel → "GitHub Copilot" for connection logs

---

## 3. OpenCode

### Configuration File

Create or edit your OpenCode configuration file:

| Operating System | Path |
|-----------------|------|
| macOS | `~/.config/opencode/mcp.json` or `~/.opencode/mcp.json` |
| Linux | `~/.config/opencode/mcp.json` |
| Windows | `%APPDATA%\opencode\mcp.json` |

### Setup Steps

1. Create/edit the `mcp.json` file:

```json
{
  "mcpServers": {
    "meeting-notes": {
      "command": "node",
      "args": ["/absolute/path/to/meeting-notes-mcp/dist/index.js"],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-v1-xxxxxxxxxx",
        "DATABASE_PATH": "/absolute/path/to/meeting-notes-mcp/data/meetings.db",
        "EMBEDDING_MODEL": "openai/text-embedding-3-small",
        "CHAT_MODEL": "anthropic/claude-sonnet-4",
        "MAX_CONTEXT_MEETINGS": "5"
      }
    }
  }
}
```

2. Restart OpenCode or reload MCP servers

### Verification

- Run `opencode mcp list` to see if "meeting-notes" appears
- Test with: "Add a meeting about product review"
- Check OpenCode logs for MCP server connection status

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | ✅ Yes | — | Your OpenRouter API key |
| `DATABASE_PATH` | ❌ No | `./data/meetings.db` | SQLite database file path |
| `EMBEDDING_MODEL` | ❌ No | `openai/text-embedding-3-small` | Model for text embeddings |
| `CHAT_MODEL` | ❌ No | — | Model for chat/summarization |
| `MAX_CONTEXT_MEETINGS` | ❌ No | `5` | Meetings included in RAG context |

---

## Troubleshooting

### Server Won't Start
- **Check**: Is Node.js installed? Run `node --version`
- **Check**: Are paths absolute? Relative paths often fail
- **Check**: Is the build output present? Run `npm run build` first

### Database Errors
- **Check**: Does the `data/` directory exist? Create it manually if needed
- **Check**: Are file permissions correct?
- **Check**: Is sqlite-vec extension loading? Look for errors in logs

### OpenRouter Errors
- **Check**: Is `OPENROUTER_API_KEY` set correctly?
- **Check**: Do you have credits on OpenRouter?
- **Check**: Is the model name correct? (e.g., `openai/text-embedding-3-small`)

### Client Can't Find Server
- **Check**: Did you restart the client after config changes?
- **Check**: Is the config file in the right location?
- **Check**: Is the JSON valid? (no trailing commas)

---

## Available Tools (After Setup)

Once connected, your AI client can use these tools:

| Tool | What It Does |
|------|-------------|
| `add_meeting` | Save new meeting notes with automatic embedding |
| `get_meeting` | Retrieve a specific meeting by ID |
| `list_meetings` | Browse meetings with filters (date, person, tag) |
| `search_meetings` | Find meetings semantically related to a query |
| `summarize_meeting` | Create a summary of a meeting in your chosen style |
| `ask_meetings` | Ask natural language questions about your meetings |

### Example Prompts

- "Add meeting: Discussed Q3 roadmap with Alice and Bob. Decided to prioritize mobile app."
- "What did we decide about pricing in the last 3 meetings?"
- "Summarize the product review meeting from June 1st."
- "Search for meetings where Alice mentioned the API redesign."

---

## Need Help?

If you encounter issues:
1. Check the MCP server output/logs for error messages
2. Verify your OpenRouter API key has sufficient credits
3. Ensure all file paths are absolute paths
4. Try running the server directly: `node dist/index.js` to see startup errors
