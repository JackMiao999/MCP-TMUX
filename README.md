# MCP TMUX Server

A Model Context Protocol (MCP) server for operating TMUX terminal multiplexer and supporting communication between AI Agents.

## Installation

### Install using Claude Command Line Tool (Recommended)

```bash
claude mcp add tmux npx @mcp-tmux/server@latest
```

### Manual Installation

```bash
npm install -g @mcp-tmux/server
```

## Core Features

✨ **TMUX Operations** - Complete tmux session, window, and pane management  
🤝 **Inter-Agent Communication** - Multiple Claude CLI AI Agents can send messages and commands to each other  
📁 **File System Message Queue** - Reliable file system-based message delivery mechanism  
🔄 **Real-time Status Sync** - Agent online status and heartbeat detection  
📜 **Message History** - Complete communication logs and command execution history

## Function List

### TMUX Management Tools

- `list_sessions` - List all tmux sessions
- `create_session` - Create a new tmux session
- `kill_session` - Terminate a specified tmux session
- `get_session_info` - Get detailed session information
- `list_windows` - List windows in a session
- `create_window` - Create a new window in a session
- `kill_window` - Close a specified window
- `list_panes` - List panes in a window
- `split_window` - Split window to create new pane
- `capture_pane` - Capture pane content
- `send_keys` - Send keystrokes to a pane

### Inter-Agent Communication Tools

- `register_agent` - Register current Agent to communication network
- `unregister_agent` - Unregister current Agent from communication network
- `list_agents` - List all online Agents
- `send_message` - Send text message to other Agents
- `send_command` - Send executable command to other Agent's terminal
- `get_messages` - Retrieve received messages
- `process_commands` - Process and execute received commands
- `get_message_history` - View communication history with specific Agent
- `clear_old_messages` - Clean up expired messages

## Development

### Clone and Build

```bash
git clone <repository-url>
cd MCP-TMUX
npm install
npm run build
```

### Development Mode

```bash
npm run watch  # Watch for file changes
npm run dev    # Run TypeScript directly
```

## Requirements

- Node.js 18+
- TMUX installed and available in system PATH

## License

MIT