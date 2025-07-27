import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TmuxSession {
  name: string;
  id: string;
  windows: number;
  attached: boolean;
  created: string;
}

export interface TmuxWindow {
  id: string;
  name: string;
  active: boolean;
  session: string;
  panes: number;
}

export interface TmuxPane {
  id: string;
  active: boolean;
  width: number;
  height: number;
  command: string;
}

export class TmuxController {
  async listSessions(): Promise<TmuxSession[]> {
    try {
      const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}:#{session_id}:#{session_windows}:#{session_attached}:#{session_created}"');
      return stdout.trim().split('\n').filter(line => line).map(line => {
        const [name, id, windows, attached, created] = line.split(':');
        return {
          name,
          id,
          windows: parseInt(windows),
          attached: attached === '1',
          created: new Date(parseInt(created) * 1000).toISOString()
        };
      });
    } catch (error: any) {
      if (error.stderr?.includes('no server running')) {
        return [];
      }
      throw error;
    }
  }

  async createSession(name: string, command?: string): Promise<string> {
    const cmd = command 
      ? `tmux new-session -d -s "${name}" "${command}"`
      : `tmux new-session -d -s "${name}"`;
    
    await execAsync(cmd);
    return `Session "${name}" created successfully`;
  }

  async killSession(name: string): Promise<string> {
    await execAsync(`tmux kill-session -t "${name}"`);
    return `Session "${name}" killed successfully`;
  }

  async listWindows(session?: string): Promise<TmuxWindow[]> {
    const target = session ? `-t "${session}"` : '';
    const { stdout } = await execAsync(`tmux list-windows ${target} -F "#{window_id}:#{window_name}:#{window_active}:#{session_name}:#{window_panes}"`);
    
    return stdout.trim().split('\n').filter(line => line).map(line => {
      const [id, name, active, sessionName, panes] = line.split(':');
      return {
        id,
        name,
        active: active === '1',
        session: sessionName,
        panes: parseInt(panes)
      };
    });
  }

  async createWindow(session: string, name?: string, command?: string): Promise<string> {
    let cmd = `tmux new-window -t "${session}"`;
    if (name) cmd += ` -n "${name}"`;
    if (command) cmd += ` "${command}"`;
    
    await execAsync(cmd);
    return `Window created in session "${session}"${name ? ` with name "${name}"` : ''}`;
  }

  async killWindow(target: string): Promise<string> {
    await execAsync(`tmux kill-window -t "${target}"`);
    return `Window "${target}" killed successfully`;
  }

  async sendKeys(target: string, keys: string, enter: boolean = true): Promise<string> {
    const cmd = enter 
      ? `tmux send-keys -t "${target}" "${keys}" C-m`
      : `tmux send-keys -t "${target}" "${keys}"`;
    
    await execAsync(cmd);
    return `Sent keys "${keys}" to "${target}"`;
  }

  async splitWindow(target: string, vertical: boolean = false, command?: string): Promise<string> {
    let cmd = `tmux split-window -t "${target}"`;
    if (vertical) cmd += ' -v';
    if (command) cmd += ` "${command}"`;
    
    await execAsync(cmd);
    return `Split window in "${target}" ${vertical ? 'vertically' : 'horizontally'}`;
  }

  async listPanes(target: string): Promise<TmuxPane[]> {
    const { stdout } = await execAsync(`tmux list-panes -t "${target}" -F "#{pane_id}:#{pane_active}:#{pane_width}:#{pane_height}:#{pane_current_command}"`);
    
    return stdout.trim().split('\n').filter(line => line).map(line => {
      const [id, active, width, height, command] = line.split(':');
      return {
        id,
        active: active === '1',
        width: parseInt(width),
        height: parseInt(height),
        command
      };
    });
  }

  async getSessionInfo(name: string): Promise<any> {
    const { stdout } = await execAsync(`tmux display-message -t "${name}" -p "#{session_name}:#{session_id}:#{session_windows}:#{session_attached}:#{session_created}:#{client_width}:#{client_height}"`);
    const [sessionName, id, windows, attached, created, width, height] = stdout.trim().split(':');
    
    return {
      name: sessionName,
      id,
      windows: parseInt(windows),
      attached: attached === '1',
      created: new Date(parseInt(created) * 1000).toISOString(),
      dimensions: {
        width: parseInt(width),
        height: parseInt(height)
      }
    };
  }

  async capturePane(target: string, startLine?: number, endLine?: number): Promise<string> {
    let cmd = `tmux capture-pane -t "${target}" -p`;
    if (startLine !== undefined) cmd += ` -S ${startLine}`;
    if (endLine !== undefined) cmd += ` -E ${endLine}`;
    
    const { stdout } = await execAsync(cmd);
    return stdout;
  }
}