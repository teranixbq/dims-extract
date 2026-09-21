# dims-extract (CLI: `dims`)

> **Figma Design Extractor & Dynamic Local MCP Server Hub** with AES-256-GCM Encrypted Token Storage.

`dims-extract` provides the convenient short CLI command **`dims`** (and `dims-extract`) to extract full Figma design systems (screens, components, tokens, texts, modals, form inputs) and automatically render high-resolution 2x PNG images into a local **Model Context Protocol (MCP)** server hub (`dims-extract-mcp`). Coding agents in **OpenCode**, **Claude Desktop**, and **Cursor** can inspect screens visually and read UI structures completely offline.

---

## ⚡ Features

- **Short Command (`dims`):** Fast to type — use `dims auth`, `dims add`, `dims list`, `dims serve`.
- **Zero External Dependencies:** Built with pure standard Node.js/Bun built-in APIs (`node:crypto`, `node:fs`, `node:readline`).
- **Encrypted Token Storage:** Figma Personal Access Token is encrypted with **AES-256-GCM** using a machine-derived PBKDF2 key and stored in the OS config directory:
  - **Linux / macOS:** `~/.config/dims-extract/config.json`
  - **Windows:** `%APPDATA%\dims-extract\config.json`
- **Multi-Project MCP Hub:** Store and manage multiple Figma projects inside a centralized `dims-extract-mcp/` directory.
- **Vision-Ready for AI:** Returns 2x PNG images via absolute paths, network URLs, or base64 data blocks for LLMs with vision capabilities.
- **Deep UI Indexing:** Automatically extracts and indexes breadcrumbs, modals, dialogs, button labels, and input fields.

---

## 📦 Installation

### Option A: Standard npm (Global)
```bash
npm install -g dims-extract
```
*(On Linux/macOS with system Node, use `sudo npm install -g dims-extract`)*

After installation, the short command **`dims`** is immediately available:
```bash
dims --help
```

### Option B: One-line Zero-Permission Installer (Linux & macOS)
```bash
curl -fsSL https://raw.githubusercontent.com/teranixbq/dims-extract/main/install.sh | bash
```

### Option C: One-line Zero-Permission Installer (Windows PowerShell)
```powershell
irm https://raw.githubusercontent.com/teranixbq/dims-extract/main/install.ps1 | iex
```

### Option D: Direct via npx (Without Installation)
```bash
npx dims-extract <command>
```

---

## 🚀 Quick Start

### 1. Store Your Figma Token (One-time Setup)

Encrypt and store your Figma token in your OS config:

```bash
dims auth figd_your_personal_access_token_here
```

Check authentication status anytime:

```bash
dims auth --status
```

### 2. Extract a Figma Project

Download and extract any Figma design file directly by URL:

```bash
dims add "https://www.figma.com/design/AbCdEf123456/SampleDesign" my-app
```

The tool will:
1. Fetch design data from the Figma REST API.
2. Index all screens, components, styles, modals, and buttons.
3. Render all screens and components into 2x resolution PNG files.
4. Save the assets into your MCP hub (`~/dims-extract-mcp/projects/my-app`).

### 3. List and Manage Projects

List all extracted projects:

```bash
dims list
```

Remove a project when no longer needed:

```bash
dims remove my-old-project
```

---

## 🤖 Connecting to AI Agents (OpenCode, Claude, Cursor)

Get ready-to-copy configurations anytime by running:

```bash
dims mcp-config
```

### 1. OpenCode (`opencode.json`)

Add to `opencode.json` in your workspace or global config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "dims-figma": {
      "type": "stdio",
      "command": "dims",
      "args": ["serve"]
    }
  }
}
```

### 2. Claude Desktop (`claude_desktop_config.json`)

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "dims-figma": {
      "command": "dims",
      "args": ["serve"]
    }
  }
}
```

---

## 🛠️ Available MCP Tools

When `dims serve` is running, AI agents have access to these 9 tools:

| Tool Name | Description | Key Parameters |
|---|---|---|
| `list_projects` | List all extracted projects in the MCP hub | - |
| `import_figma_project` | Dynamically extract a new Figma project during chat | `figma_url`, `token` (optional), `project_name` |
| `list_screens` | List UI screens for a project | `project`, `role`, `search` |
| `get_screen_details` | Get deep hierarchy (breadcrumbs, modals, buttons, form inputs, texts) | `screen_id`, `project` |
| `get_screen_image` | Get 2x PNG image (file path or base64 vision block) | `screen_id`, `project`, `format` |
| `list_components` | List design system components and variants | `project`, `search` |
| `get_design_tokens` | Retrieve typography, effect, and color styles | `project`, `type` |
| `search_design` | Search text, modals, and elements across one or all projects | `query`, `project` |
| `get_project_summary` | Get project architecture summary and statistics | `project` |

---

## 📖 CLI Reference

```
dims <command> [arguments] [options] (alias: dims-extract)

COMMANDS:
  auth [token]              Store and encrypt your Figma Personal Access Token
  auth --status             Check current authentication status
  auth --logout             Remove stored Figma token
  add <url> [name]          Download and extract a Figma project into local MCP hub
  list, ls                  List all extracted Figma projects
  remove, rm <name>         Delete an extracted project from local MCP hub
  serve                     Start the local MCP server (stdio mode for AI agents)
  serve --remote            Start the MCP server as Remote HTTP/SSE server (for 2nd laptop)
  mcp-config                Show ready-to-use configuration for OpenCode, Claude Desktop, Cursor
  config                    Show current storage paths and settings
  help, --help, -h          Show help message
```

---

## 🔒 Security

- Your Figma Personal Access Token is **never stored in plaintext**.
- Token encryption uses standard **AES-256-GCM** with a PBKDF2 key derived from machine-specific credentials.
- All extracted designs are saved in your user home directory (`dims-extract-mcp/`), safely outside your code repositories.

---

## 📄 License

MIT © dims
