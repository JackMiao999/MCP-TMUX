#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { TmuxController } from "./tmux-tools.js";
import { AgentCommunicationManager } from "./agent-communication.js";

const server = new Server(
  {
    name: "mcp-tmux-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const tmux = new TmuxController();
const agentComm = new AgentCommunicationManager(process.env.AGENT_NAME || `agent-${Date.now()}`);

// Tool definitions and parameter schemas
const toolSchemas = {
  list_sessions: z.object({}),
  create_session: z.object({
    name: z.string().describe("Session name"),
    command: z.string().optional().describe("Initial command to run"),
  }),
  kill_session: z.object({
    name: z.string().describe("Session name to kill"),
  }),
  list_windows: z.object({
    session: z.string().optional().describe("Session name to list windows for"),
  }),
  create_window: z.object({
    session: z.string().describe("Target session name"),
    name: z.string().optional().describe("Window name"),
    command: z.string().optional().describe("Command to run in window"),
  }),
  kill_window: z.object({
    target: z.string().describe("Window target (session:window or window_id)"),
  }),
  send_keys: z.object({
    target: z.string().describe("Target (session:window.pane or pane_id)"),
    keys: z.string().describe("Keys to send"),
    enter: z.boolean().default(true).describe("Whether to press Enter after sending keys"),
  }),
  split_window: z.object({
    target: z.string().describe("Target window"),
    vertical: z.boolean().default(false).describe("Split vertically instead of horizontally"),
    command: z.string().optional().describe("Command to run in new pane"),
  }),
  list_panes: z.object({
    target: z.string().describe("Target session or window"),
  }),
  get_session_info: z.object({
    name: z.string().describe("Session name"),
  }),
  capture_pane: z.object({
    target: z.string().describe("Target pane"),
    start_line: z.number().optional().describe("Start line number"),
    end_line: z.number().optional().describe("End line number"),
  }),
  // Agent communication tools
  register_agent: z.object({
    session_name: z.string().describe("TMUX session name for this agent"),
  }),
  unregister_agent: z.object({}),
  list_agents: z.object({}),
  send_message: z.object({
    target_agent_id: z.string().describe("Target agent ID"),
    message: z.string().describe("Message to send"),
  }),
  send_command: z.object({
    target_agent_id: z.string().describe("Target agent ID"),
    command: z.string().describe("Command to send"),
    session: z.string().optional().describe("Target session name"),
    window: z.string().optional().describe("Target window"),
    pane: z.string().optional().describe("Target pane"),
  }),
  get_messages: z.object({}),
  process_commands: z.object({}),
  get_message_history: z.object({
    target_agent_id: z.string().optional().describe("Filter by specific agent"),
    limit: z.number().default(50).describe("Number of messages to retrieve"),
  }),
  clear_old_messages: z.object({
    hours_old: z.number().default(24).describe("Clear messages older than X hours"),
  }),
};

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_sessions",
        description: "List all tmux sessions",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "create_session",
        description: "Create a new tmux session",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Session name",
            },
            command: {
              type: "string",
              description: "Initial command to run",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "kill_session",
        description: "Kill a tmux session",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Session name to kill",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "list_windows",
        description: "List windows in a session or all sessions",
        inputSchema: {
          type: "object",
          properties: {
            session: {
              type: "string",
              description: "Session name to list windows for (optional)",
            },
          },
        },
      },
      {
        name: "create_window",
        description: "Create a new window in a session",
        inputSchema: {
          type: "object",
          properties: {
            session: {
              type: "string",
              description: "Target session name",
            },
            name: {
              type: "string",
              description: "Window name",
            },
            command: {
              type: "string",
              description: "Command to run in window",
            },
          },
          required: ["session"],
        },
      },
      {
        name: "kill_window",
        description: "Kill a window",
        inputSchema: {
          type: "object",
          properties: {
            target: {
              type: "string",
              description: "Window target (session:window or window_id)",
            },
          },
          required: ["target"],
        },
      },
      {
        name: "send_keys",
        description: "Send keys to a tmux pane",
        inputSchema: {
          type: "object",
          properties: {
            target: {
              type: "string",
              description: "Target (session:window.pane or pane_id)",
            },
            keys: {
              type: "string",
              description: "Keys to send",
            },
            enter: {
              type: "boolean",
              description: "Whether to press Enter after sending keys",
              default: true,
            },
          },
          required: ["target", "keys"],
        },
      },
      {
        name: "split_window",
        description: "Split a tmux window into panes",
        inputSchema: {
          type: "object",
          properties: {
            target: {
              type: "string",
              description: "Target window",
            },
            vertical: {
              type: "boolean",
              description: "Split vertically instead of horizontally",
              default: false,
            },
            command: {
              type: "string",
              description: "Command to run in new pane",
            },
          },
          required: ["target"],
        },
      },
      {
        name: "list_panes",
        description: "List panes in a window or session",
        inputSchema: {
          type: "object",
          properties: {
            target: {
              type: "string",
              description: "Target session or window",
            },
          },
          required: ["target"],
        },
      },
      {
        name: "get_session_info",
        description: "Get detailed information about a session",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Session name",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "capture_pane",
        description: "Capture content from a tmux pane",
        inputSchema: {
          type: "object",
          properties: {
            target: {
              type: "string",
              description: "Target pane",
            },
            start_line: {
              type: "number",
              description: "Start line number",
            },
            end_line: {
              type: "number",
              description: "End line number",
            },
          },
          required: ["target"],
        },
      },
      // Agent communication tools
      {
        name: "register_agent",
        description: "Register this agent for inter-agent communication",
        inputSchema: {
          type: "object",
          properties: {
            session_name: {
              type: "string",
              description: "TMUX session name for this agent",
            },
          },
          required: ["session_name"],
        },
      },
      {
        name: "unregister_agent",
        description: "Unregister this agent from communication",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "list_agents",
        description: "List all active agents available for communication",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "send_message",
        description: "Send a message to another agent",
        inputSchema: {
          type: "object",
          properties: {
            target_agent_id: {
              type: "string",
              description: "Target agent ID",
            },
            message: {
              type: "string",
              description: "Message to send",
            },
          },
          required: ["target_agent_id", "message"],
        },
      },
      {
        name: "send_command",
        description: "Send a command to another agent's terminal",
        inputSchema: {
          type: "object",
          properties: {
            target_agent_id: {
              type: "string",
              description: "Target agent ID",
            },
            command: {
              type: "string",
              description: "Command to send",
            },
            session: {
              type: "string",
              description: "Target session name",
            },
            window: {
              type: "string",
              description: "Target window",
            },
            pane: {
              type: "string",
              description: "Target pane",
            },
          },
          required: ["target_agent_id", "command"],
        },
      },
      {
        name: "get_messages",
        description: "Get incoming messages for this agent",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "process_commands",
        description: "Process incoming commands from other agents",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_message_history",
        description: "Get message history with other agents",
        inputSchema: {
          type: "object",
          properties: {
            target_agent_id: {
              type: "string",
              description: "Filter by specific agent",
            },
            limit: {
              type: "number",
              description: "Number of messages to retrieve",
              default: 50,
            },
          },
        },
      },
      {
        name: "clear_old_messages",
        description: "Clear old messages to free up space",
        inputSchema: {
          type: "object",
          properties: {
            hours_old: {
              type: "number",
              description: "Clear messages older than X hours",
              default: 24,
            },
          },
        },
      },
    ],
  };
});

// Register tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_sessions": {
        const sessions = await tmux.listSessions();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(sessions, null, 2),
            },
          ],
        };
      }

      case "create_session": {
        const { name: sessionName, command } = toolSchemas.create_session.parse(args);
        const result = await tmux.createSession(sessionName, command);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "kill_session": {
        const { name: sessionName } = toolSchemas.kill_session.parse(args);
        const result = await tmux.killSession(sessionName);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "list_windows": {
        const { session } = toolSchemas.list_windows.parse(args);
        const windows = await tmux.listWindows(session);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(windows, null, 2),
            },
          ],
        };
      }

      case "create_window": {
        const { session, name: windowName, command } = toolSchemas.create_window.parse(args);
        const result = await tmux.createWindow(session, windowName, command);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "kill_window": {
        const { target } = toolSchemas.kill_window.parse(args);
        const result = await tmux.killWindow(target);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "send_keys": {
        const { target, keys, enter } = toolSchemas.send_keys.parse(args);
        const result = await tmux.sendKeys(target, keys, enter);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "split_window": {
        const { target, vertical, command } = toolSchemas.split_window.parse(args);
        const result = await tmux.splitWindow(target, vertical, command);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "list_panes": {
        const { target } = toolSchemas.list_panes.parse(args);
        const panes = await tmux.listPanes(target);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(panes, null, 2),
            },
          ],
        };
      }

      case "get_session_info": {
        const { name: sessionName } = toolSchemas.get_session_info.parse(args);
        const info = await tmux.getSessionInfo(sessionName);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(info, null, 2),
            },
          ],
        };
      }

      case "capture_pane": {
        const { target, start_line, end_line } = toolSchemas.capture_pane.parse(args);
        const content = await tmux.capturePane(target, start_line, end_line);
        return {
          content: [
            {
              type: "text",
              text: content,
            },
          ],
        };
      }

      // Agent communication tools
      case "register_agent": {
        const { session_name } = toolSchemas.register_agent.parse(args);
        const result = await agentComm.registerAgent(session_name);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "unregister_agent": {
        const result = await agentComm.unregisterAgent();
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "list_agents": {
        const agents = await agentComm.listActiveAgents();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(agents, null, 2),
            },
          ],
        };
      }

      case "send_message": {
        const { target_agent_id, message } = toolSchemas.send_message.parse(args);
        const result = await agentComm.sendMessage(target_agent_id, message);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "send_command": {
        const { target_agent_id, command, session, window, pane } = toolSchemas.send_command.parse(args);
        const sessionInfo = session ? { session, window, pane } : undefined;
        const result = await agentComm.sendCommandToAgent(target_agent_id, command, sessionInfo);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "get_messages": {
        const messages = await agentComm.getIncomingMessages();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(messages, null, 2),
            },
          ],
        };
      }

      case "process_commands": {
        const results = await agentComm.processIncomingCommands();
        return {
          content: [
            {
              type: "text",
              text: results.join('\n'),
            },
          ],
        };
      }

      case "get_message_history": {
        const { target_agent_id, limit } = toolSchemas.get_message_history.parse(args);
        const history = await agentComm.getMessageHistory(target_agent_id, limit);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(history, null, 2),
            },
          ],
        };
      }

      case "clear_old_messages": {
        const { hours_old } = toolSchemas.clear_old_messages.parse(args);
        const result = await agentComm.clearOldMessages(hours_old);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Start heartbeat mechanism, update status every 30 seconds
  setInterval(async () => {
    try {
      await agentComm.updateHeartbeat();
    } catch (error) {
      console.error('Heartbeat update failed:', error);
    }
  }, 30000);
  
  console.error("MCP TMUX Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});