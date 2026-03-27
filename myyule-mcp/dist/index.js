#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// ==================== 配置 ====================
const API_BASE_URL = 'https://testapi.myyule.com';
const APP_ID = 'com.myyule.ios.qiyinbeta';
const APP_VERSION = '1.0.0';
const AUTH_FILE = path_1.default.join(process.env.HOME || '', '.myyule/auth.json');
const LOGIN_TOOL = path_1.default.join(process.env.HOME || '', '.local/bin/myyule-login');
// ==================== 认证管理 ====================
function getAuth() {
    try {
        const auth = JSON.parse(fs_1.default.readFileSync(AUTH_FILE, 'utf-8'));
        if (auth.userId && auth.token) {
            return { userId: auth.userId, token: auth.token, phoneNumber: auth.phoneNumber, deviceId: auth.deviceId };
        }
        return null;
    }
    catch {
        return null;
    }
}
// ==================== 工具函数 ====================
function generateId() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
function buildRequestParams(type, extraParams = {}) {
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
async function callAPI(endpoint, data, token) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await (0, axios_1.default)({
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
        }
        catch (error) {
            throw new Error(`登录失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }
    // 查询在线状态
    const params = buildRequestParams('myyule_public_account_onlineStatus', {
        queryUserId: auth.userId,
        queryType: '0',
    });
    const result = await callAPI('/myyule-server-gateway/myyule_public_account_onlineStatus/v1.0', params, auth.token);
    if (result.status === '0') {
        const isOnline = result.onlineStatus === '0';
        return {
            success: true,
            online: isOnline,
            statusText: isOnline ? '在线' : '离线',
            userId: auth.userId,
        };
    }
    else {
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
const server = new index_js_1.Server({ name: 'myyule-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
    tools: TOOLS,
}));
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        return {
            content: [{ type: 'text', text: `❌ 错误: ${errorMessage}` }],
            isError: true,
        };
    }
});
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error('✅ MyYule MCP Server 已启动');
    const auth = getAuth();
    if (auth) {
        console.error(`📌 当前用户: ${auth.userId}`);
    }
    else {
        console.error('⚠️  未登录，首次调用 check_online 时会自动调用登录工具');
    }
}
main().catch(console.error);
