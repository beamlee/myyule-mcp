#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import axios from 'axios';
import crypto from 'crypto';

// ==================== 配置 ====================
const API_BASE_URL = 'https://testapi.myyule.com';
const APP_ID = 'com.myyule.ios.qiyinbeta';
const APP_VERSION = '1.0.0';
const CONFIG_FILE = path.join(process.env.HOME || '', '.myyule/auth.json');

// ==================== 设备ID管理 ====================

function getDeviceId(): string {
  try {
    const auth = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    if (auth.deviceId) return auth.deviceId;
  } catch {}
  return crypto.randomUUID();
}

function saveDeviceId(deviceId: string) {
  let auth: any = {};
  try {
    auth = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {}
  auth.deviceId = deviceId;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(auth, null, 2));
}

// ==================== 工具函数 ====================

function generateId(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendSmsCode(phoneNumber: string, deviceId: string): Promise<void> {
  const params = {
    id: generateId(),
    version: APP_VERSION,
    type: 'myyule_public_account_code',
    action: 'request',
    appId: APP_ID,
    appVersion: APP_VERSION,
    userId: deviceId,
    deviceId: deviceId,
    phoneNumber: phoneNumber,
  };

  const response = await axios({
    method: 'POST',
    url: `${API_BASE_URL}/myyule-server-gateway/myyule_public_account_code/v1.0`,
    data: params,
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  if (response.data.status !== '0') {
    throw new Error(`发送验证码失败: ${response.data.desc || '未知错误'}`);
  }

  console.log(`✅ 验证码已发送到 ${phoneNumber}`);
}

async function loginWithCode(phoneNumber: string, code: string, deviceId: string): Promise<{ userId: string; token: string }> {
  const params = {
    id: generateId(),
    version: APP_VERSION,
    type: 'myyule_public_account_login',
    action: 'request',
    appId: APP_ID,
    appVersion: APP_VERSION,
    userId: deviceId,
    deviceId: deviceId,
    phoneNumber: phoneNumber,
    phoneCode: code,
  };

  const response = await axios({
    method: 'POST',
    url: `${API_BASE_URL}/myyule-server-gateway/myyule_public_account_login/v1.0`,
    data: params,
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  if (response.data.status !== '0') {
    throw new Error(`登录失败: ${response.data.desc || '未知错误'}`);
  }

  const { userId, token } = response.data.data;
  return { userId, token };
}

function saveAuth(userId: string, token: string, phoneNumber: string, deviceId: string) {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({
    userId,
    token,
    phoneNumber,
    deviceId,
    updatedAt: new Date().toISOString()
  }, null, 2));
  console.log(`✅ 认证信息已保存: userId=${userId}`);
}

// ==================== 登录主流程 ====================

async function login() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const deviceId = getDeviceId();

  console.log('');
  console.log('=========================================');
  console.log('  MyYule 登录');
  console.log('=========================================');

  const phoneNumber = await new Promise<string>((resolve) => {
    rl.question('📱 请输入手机号: ', (answer) => {
      resolve(answer.trim());
    });
  });

  if (!phoneNumber || !/^1[0-9]{10}$/.test(phoneNumber)) {
    rl.close();
    console.error('❌ 手机号格式不正确');
    process.exit(1);
  }

  console.log('📱 正在发送验证码...');
  await sendSmsCode(phoneNumber, deviceId);

  const code = await new Promise<string>((resolve) => {
    rl.question('🔐 请输入短信验证码: ', (answer) => {
      resolve(answer.trim());
      rl.close();
    });
  });

  console.log('🔐 正在登录...');
  const { userId, token } = await loginWithCode(phoneNumber, code, deviceId);

  saveAuth(userId, token, phoneNumber, deviceId);

  console.log('');
  console.log('=========================================');
  console.log('✅ 登录成功！');
  console.log(`📌 用户ID: ${userId}`);
  console.log(`📱 手机号: ${phoneNumber}`);
  console.log('=========================================');
}

login().catch((error) => {
  console.error('❌ 登录失败:', error.message);
  process.exit(1);
});
