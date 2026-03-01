# Blink API — MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that wraps the PactPay Blink API, exposing every escrow endpoint as a tool that AI agents (Claude, etc.) can call directly.

---

## Prerequisites

- **Node.js** ≥ 18
- The **Blink API** running locally or deployed (see the root [`README.md`](../README.md))
- A configured `api/.env.local` (see [Environment Setup](#environment-setup))

---

## Installation

```bash
cd blink-mcp-server
npm install
npm run build
```

This compiles the TypeScript source to `dist/index.js`.

---

## Environment Setup

The MCP server reads two environment variables at runtime — you do **not** add them to any `.env` file here; they are passed in via your MCP client's config (see below).

| Variable | Description |
|---|---|
| `BLINK_API_URL` | Base URL of the Blink API, e.g. `http://localhost:3001/api/v1` |
| `BLINK_API_KEY` | Value of `BLINK_API_KEY` in `api/.env.local`. Leave empty `""` if auth is disabled. |

---

## Available Tools

| Tool | API Endpoint | Description |
|---|---|---|
| `browse_rooms` | `GET /rooms` | Browse public escrow rooms with filters |
| `create_room` | `POST /rooms` | Create a new on-chain escrow room |
| `get_room` | `GET /rooms/:id` | Fetch room details + live on-chain state |
| `join_room` | `POST /rooms/join` | Join a room using a join code |
| `stake_room` | `POST /rooms/:id/stake` | Fund the creator or joiner side of the escrow |
| `submit_transaction` | `POST /tx/submit` | Submit a signed Solana transaction |
| `approve_room` | `POST /rooms/:id/approve` | Signal resolution approval |
| `resolve_room` | `POST /rooms/:id/resolve` | Release escrowed SOL back to participants |
| `slash_room` | `POST /rooms/:id/slash` | Send all escrowed SOL to the penalty wallet |
| `cancel_room` | `POST /rooms/:id/cancel` | Cancel a room before it is fully funded |
| `manage_events` | `GET/POST /events` | Start, stop, poll, or check the on-chain event listener |

---

## Connecting to Claude Desktop

### 1. Start the Blink API

Make sure the API is running before opening Claude Desktop:

```bash
# From the repo root:
npm run dev:api   # starts on http://localhost:3001
```

### 2. Find the Claude Desktop config file

| OS | Path |
|---|---|
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json` |
| **macOS** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Linux** | `~/.config/Claude/claude_desktop_config.json` |

Create the file if it doesn't exist.

### 3. Add the MCP server entry

Replace `<ABSOLUTE_PATH>` with the actual path on your machine.

**Windows:**
```json
{
  "mcpServers": {
    "blink-api": {
      "command": "node",
      "args": [
        "C:\\Users\\<you>\\Projects\\Universal-PactPay-Blink-API\\blink-mcp-server\\dist\\index.js"
      ],
      "env": {
        "BLINK_API_URL": "http://localhost:3001/api/v1",
        "BLINK_API_KEY": ""
      }
    }
  }
}
```

**macOS / Linux:**
```json
{
  "mcpServers": {
    "blink-api": {
      "command": "node",
      "args": [
        "/Users/<you>/Projects/Universal-PactPay-Blink-API/blink-mcp-server/dist/index.js"
      ],
      "env": {
        "BLINK_API_URL": "http://localhost:3001/api/v1",
        "BLINK_API_KEY": ""
      }
    }
  }
}
```

> Set `BLINK_API_KEY` to whatever value is in `api/.env.local`. If you left it empty (auth disabled for local dev), use `""`.

### 4. Restart Claude Desktop

Fully quit and reopen it — the config is only read on startup. You should see a **hammer icon** in the chat input area, with the 11 Blink tools listed under it.

---

## Connecting to VS Code (GitHub Copilot Chat)

Add the server to your VS Code `settings.json` or a workspace `.vscode/mcp.json`:

```json
{
  "mcp": {
    "servers": {
      "blink-api": {
        "type": "stdio",
        "command": "node",
        "args": ["${workspaceFolder}/blink-mcp-server/dist/index.js"],
        "env": {
          "BLINK_API_URL": "http://localhost:3001/api/v1",
          "BLINK_API_KEY": ""
        }
      }
    }
  }
}
```

---

## Pointing at a Deployed API

If the Blink API is deployed on Railway (or anywhere else), just swap the URL:

```json
"BLINK_API_URL": "https://your-app.up.railway.app/api/v1",
"BLINK_API_KEY": "your-production-key"
```

---

## Verifying the Server Works

Run this in a terminal — the process should hang silently (waiting for stdin input from an MCP client). That means it started correctly. Press `Ctrl+C` to exit.

**Windows (PowerShell):**
```powershell
$env:BLINK_API_URL="http://localhost:3001/api/v1"
$env:BLINK_API_KEY=""
node .\dist\index.js
```

**macOS / Linux:**
```bash
BLINK_API_URL="http://localhost:3001/api/v1" BLINK_API_KEY="" node dist/index.js
```

---

## Rebuilding After Changes

If you edit `src/index.ts`, recompile before restarting your MCP client:

```bash
npm run build
```
