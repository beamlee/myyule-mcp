#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ==================== 配置 ====================
const API_BASE_URL = 'https://testapi.myyule.com';
const APP_ID = 'com.myyule.ios.qiyinbeta';
const APP_VERSION = '1.0.0';
const AUTH_FILE = path.join(process.env.HOME || '', '.myyule/auth.json');
const LOGIN_TOOL = path.join(process.env.HOME || '', '.local/bin/myyule-login');

// ==================== 认证管理 ====================

function getAuth(): { userId: string; token: string; phoneNumber?: string; deviceId?: string } | null {
  try {
    const auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    if (auth.userId && auth.token) {
      return { userId: auth.userId, token: auth.token, phoneNumber: auth.phoneNumber, deviceId: auth.deviceId };
    }
    return null;
  } catch {
    return null;
  }
}

// ==================== 工具函数 ====================

function generateId(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function buildRequestParams(type: string, extraParams: Record<string, any> = {}): Record<string, any> {
  const auth = getAuth();
  return {
    id: generateId(),
    version: APP_VERSION,
    type: type,
    action: 'request',
    appId: APP_ID,
    appVersion: APP_VERSION,
    userId: auth?.userId || 'unknown',
    deviceId: auth?.deviceId || 'unknown',
    ...extraParams,
  };
}

async function callAPI(endpoint: string, data: any, token?: string) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await axios({
    method: 'POST',
    url,
    data,
    headers,
    timeout: 30000,
  });
  return response.data;
}

// ==================== 业务函数 ====================

async function checkOnline() {
  let auth = getAuth();
  
  // 未登录，调用外部登录工具
  if (!auth) {
    console.error('⚠️  未检测到登录信息，正在启动登录工具...');
    try {
      const { stdout, stderr } = await execAsync(LOGIN_TOOL);
      console.error(stderr);
      console.log(stdout);
      
      // 重新获取认证信息
      auth = getAuth();
      if (!auth) {
        throw new Error('登录失败，请重试');
      }
    } catch (error) {
      throw new Error(`登录失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }
  
  // 查询在线状态
  const params = buildRequestParams('myyule_public_account_onlineStatus', {
    queryUserId: auth.userId,
    queryType: '0',
  });
  
  const result = await callAPI(
    '/myyule-server-gateway/myyule_public_account_onlineStatus/v1.0',
    params,
    auth.token
  );
  
  if (result.status === '0') {
    const isOnline = result.onlineStatus === '0';
    return {
      success: true,
      online: isOnline,
      statusText: isOnline ? '在线' : '离线',
      userId: auth.userId,
    };
  } else {
    throw new Error(`查询失败: ${result.desc || '未知错误'}`);
  }
}

// ==================== MCP 工具定义 ====================

const TOOLS = [
  {
    name: 'check_online',
    description: '查询当前用户是否在线（会自动调用登录工具）',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ==================== MCP Server ====================

const server = new Server(
  { name: 'myyule-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  
  try {
    let result;
    switch (name) {
      case 'check_online':
        result = await checkOnline();
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    return {
      content: [{ type: 'text', text: `❌ 错误: ${errorMessage}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('✅ MyYule MCP Server 已启动');
  const auth = getAuth();
  if (auth) {
    console.error(`📌 当前用户: ${auth.userId}`);
  } else {
    console.error('⚠️  未登录，首次调用 check_online 时会自动调用登录工具');
  }
}

main().catch(console.error);
