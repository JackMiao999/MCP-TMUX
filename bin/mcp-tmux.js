#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 启动 MCP 服务器
const serverPath = join(__dirname, '..', 'dist', 'index.js');

const child = spawn('node', [serverPath], {
  stdio: 'inherit',
  env: { ...process.env }
});

child.on('error', (err) => {
  console.error('Failed to start MCP TMUX server:', err);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code || 0);
});

// 处理进程退出
process.on('SIGINT', () => {
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});