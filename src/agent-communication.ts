import { readFile, writeFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { TmuxController } from './tmux-tools.js';

export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: 'command' | 'message' | 'response';
  content: string;
  timestamp: string;
  sessionInfo?: {
    session: string;
    window?: string;
    pane?: string;
  };
}

export interface AgentInfo {
  id: string;
  name: string;
  session: string;
  lastSeen: string;
  status: 'online' | 'offline';
}

export class AgentCommunicationManager {
  private agentId: string;
  private agentName: string;
  private messagesDir: string;
  private agentsDir: string;
  private tmux: TmuxController;

  constructor(agentName: string) {
    this.agentId = randomUUID();
    this.agentName = agentName;
    this.messagesDir = join(process.env.HOME || '/tmp', '.mcp-tmux', 'messages');
    this.agentsDir = join(process.env.HOME || '/tmp', '.mcp-tmux', 'agents');
    this.tmux = new TmuxController();
    this.initializeDirectories();
  }

  private async initializeDirectories(): Promise<void> {
    try {
      await mkdir(this.messagesDir, { recursive: true });
      await mkdir(this.agentsDir, { recursive: true });
    } catch (error) {
      // Directory already exists, ignore error
    }
  }

  async registerAgent(sessionName: string): Promise<string> {
    const agentInfo: AgentInfo = {
      id: this.agentId,
      name: this.agentName,
      session: sessionName,
      lastSeen: new Date().toISOString(),
      status: 'online'
    };

    const agentFile = join(this.agentsDir, `${this.agentId}.json`);
    await writeFile(agentFile, JSON.stringify(agentInfo, null, 2));
    
    return `Agent "${this.agentName}" registered with ID: ${this.agentId}`;
  }

  async unregisterAgent(): Promise<string> {
    const agentFile = join(this.agentsDir, `${this.agentId}.json`);
    try {
      await unlink(agentFile);
      return `Agent "${this.agentName}" unregistered successfully`;
    } catch (error: any) {
      return `Failed to unregister agent: ${error.message}`;
    }
  }

  async listActiveAgents(): Promise<AgentInfo[]> {
    try {
      const files = await readdir(this.agentsDir);
      const agents: AgentInfo[] = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await readFile(join(this.agentsDir, file), 'utf-8');
            const agent: AgentInfo = JSON.parse(content);
            
            // Check if expired (active within 5 minutes)
            const lastSeen = new Date(agent.lastSeen);
            const now = new Date();
            const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
            
            if (diffMinutes < 5) {
              agent.status = 'online';
              agents.push(agent);
            } else {
              agent.status = 'offline';
              agents.push(agent);
            }
          } catch (error) {
            // Ignore corrupted files
          }
        }
      }
      
      return agents;
    } catch (error) {
      return [];
    }
  }

  async getAgentInfo(agentId: string): Promise<AgentInfo | null> {
    try {
      const agentFile = join(this.agentsDir, `${agentId}.json`);
      const content = await readFile(agentFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  async sendMessage(targetAgentId: string, content: string, type: 'command' | 'message' = 'message'): Promise<string> {
    const message: AgentMessage = {
      id: randomUUID(),
      from: this.agentId,
      to: targetAgentId,
      type,
      content,
      timestamp: new Date().toISOString()
    };

    const messageFile = join(this.messagesDir, `${message.id}.json`);
    await writeFile(messageFile, JSON.stringify(message, null, 2));
    
    // If sending a message, try to send directly to target agent's tmux window
    if (type === 'message') {
      const targetAgent = await this.getAgentInfo(targetAgentId);
      if (targetAgent && targetAgent.session) {
        try {
          // Send message to tmux window
          const target = `${targetAgent.session}:0`; // Assume agent is in window 0
          await this.tmux.sendKeys(target, content, false); // Send message content first, without Enter
          
          // Wait 0.5 seconds for UI to register (reference: send-claude-message.sh)
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Send Enter key to submit message
          await this.tmux.sendKeys(target, '', true); // Only send Enter
          
          return `Message sent to agent ${targetAgentId} in tmux session ${targetAgent.session}: ${content}`;
        } catch (error: any) {
          return `Message saved for agent ${targetAgentId}, but failed to send to tmux: ${error.message}`;
        }
      }
    }
    
    return `Message sent to agent ${targetAgentId}: ${content}`;
  }

  async sendCommandToAgent(targetAgentId: string, command: string, sessionInfo?: { session: string; window?: string; pane?: string }): Promise<string> {
    const message: AgentMessage = {
      id: randomUUID(),
      from: this.agentId,
      to: targetAgentId,
      type: 'command',
      content: command,
      timestamp: new Date().toISOString(),
      sessionInfo
    };

    const messageFile = join(this.messagesDir, `${message.id}.json`);
    await writeFile(messageFile, JSON.stringify(message, null, 2));
    
    // If there's session info, send directly to tmux
    if (sessionInfo) {
      try {
        const target = sessionInfo.pane || `${sessionInfo.session}:${sessionInfo.window || 0}`;
        // Send command content first, without Enter
        await this.tmux.sendKeys(target, command, false);
        
        // Wait 0.5 seconds for UI to register (reference: send-claude-message.sh)
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Send Enter key to submit command
        await this.tmux.sendKeys(target, '', true);
        
        return `Command sent to agent ${targetAgentId} and executed in tmux: ${command}`;
      } catch (error: any) {
        return `Command queued for agent ${targetAgentId}, but failed to execute in tmux: ${error.message}`;
      }
    }
    
    // If no session info, try to get from agent info
    const targetAgent = await this.getAgentInfo(targetAgentId);
    if (targetAgent && targetAgent.session) {
      try {
        const target = `${targetAgent.session}:0`; // Assume agent is in window 0
        // Send command content first, without Enter
        await this.tmux.sendKeys(target, command, false);
        
        // Wait 0.5 seconds for UI to register
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Send Enter key to submit command
        await this.tmux.sendKeys(target, '', true);
        
        return `Command sent to agent ${targetAgentId} in tmux session ${targetAgent.session}: ${command}`;
      } catch (error: any) {
        return `Command queued for agent ${targetAgentId}, but failed to send to tmux: ${error.message}`;
      }
    }
    
    return `Command queued for agent ${targetAgentId}: ${command}`;
  }

  async getIncomingMessages(): Promise<AgentMessage[]> {
    try {
      const files = await readdir(this.messagesDir);
      const messages: AgentMessage[] = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await readFile(join(this.messagesDir, file), 'utf-8');
            const message: AgentMessage = JSON.parse(content);
            
            if (message.to === this.agentId) {
              messages.push(message);
            }
          } catch (error) {
            // Ignore corrupted files
          }
        }
      }
      
      // Sort by time
      return messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } catch (error) {
      return [];
    }
  }

  async processIncomingCommands(): Promise<string[]> {
    const messages = await this.getIncomingMessages();
    const results: string[] = [];
    
    for (const message of messages) {
      if (message.type === 'command') {
        try {
          // Execute command (can be integrated with tmux or other execution environment)
          const result = `Processed command from ${message.from}: ${message.content}`;
          results.push(result);
          
          // Send response
          await this.sendMessage(message.from, `Command executed: ${message.content}`, 'message');
          
          // Delete processed message
          await this.deleteMessage(message.id);
        } catch (error: any) {
          results.push(`Failed to process command: ${error.message}`);
        }
      }
    }
    
    return results;
  }

  async deleteMessage(messageId: string): Promise<void> {
    try {
      const messageFile = join(this.messagesDir, `${messageId}.json`);
      await unlink(messageFile);
    } catch (error) {
      // File may have been deleted, ignore error
    }
  }

  async clearOldMessages(hoursOld: number = 24): Promise<string> {
    try {
      const files = await readdir(this.messagesDir);
      let deletedCount = 0;
      const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = join(this.messagesDir, file);
          const stats = await stat(filePath);
          
          if (stats.mtime < cutoffTime) {
            await unlink(filePath);
            deletedCount++;
          }
        }
      }
      
      return `Deleted ${deletedCount} old messages`;
    } catch (error: any) {
      return `Failed to clear old messages: ${error.message}`;
    }
  }

  async getMessageHistory(targetAgentId?: string, limit: number = 50): Promise<AgentMessage[]> {
    try {
      const files = await readdir(this.messagesDir);
      const messages: AgentMessage[] = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await readFile(join(this.messagesDir, file), 'utf-8');
            const message: AgentMessage = JSON.parse(content);
            
            const isRelevant = !targetAgentId || 
              message.from === targetAgentId || 
              message.to === targetAgentId ||
              message.from === this.agentId ||
              message.to === this.agentId;
              
            if (isRelevant) {
              messages.push(message);
            }
          } catch (error) {
            // Ignore corrupted files
          }
        }
      }
      
      // Sort by time and limit quantity
      return messages
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
    } catch (error) {
      return [];
    }
  }

  async updateHeartbeat(): Promise<void> {
    const agentFile = join(this.agentsDir, `${this.agentId}.json`);
    try {
      const content = await readFile(agentFile, 'utf-8');
      const agentInfo: AgentInfo = JSON.parse(content);
      agentInfo.lastSeen = new Date().toISOString();
      agentInfo.status = 'online';
      await writeFile(agentFile, JSON.stringify(agentInfo, null, 2));
    } catch (error) {
      // If file doesn't exist, re-register
      // Can handle re-registration logic here
    }
  }
}