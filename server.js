/**
 * Server.js - Enterprise Edition (Optimized)
 * 优化内容：修复内存泄漏、异步日志写入、连接池复用、超时控制
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https'); // 引入 https 模块用于 Agent
require('dotenv').config();

// ==========================================
// 1. 基础工具与配置 (Infrastructure)
// ==========================================

/**
 * 全局 HTTP Agent，复用 TCP 连接，减少握手开销
 */
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 100, // 限制并发连接数
  timeout: 60000   // Socket 超时
});

/**
 * 增强日志工具 - 异步写入优化版
 */
const Logger = {
  logDir: path.join(__dirname, 'logs'),
  logStreams: new Map(), // 缓存写入流

  init: function() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    // 启动定期清理日志任务
    setInterval(() => this.cleanOldLogs(), 24 * 60 * 60 * 1000);
  },

  getLogStream: function(fileName) {
    if (!this.logStreams.has(fileName)) {
      const filePath = path.join(this.logDir, fileName);
      // 使用追加模式创建写入流
      const stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });
      this.logStreams.set(fileName, stream);

      // 监听错误防止崩溃
      stream.on('error', (err) => {
        console.error(`日志流写入错误 [${fileName}]:`, err);
        // 出错后移除流，下次尝试重新创建
        stream.end();
        this.logStreams.delete(fileName);
      });
    }
    return this.logStreams.get(fileName);
  },

  getLogFileName: function(level) {
    const date = new Date().toISOString().split('T')[0];
    return level === 'error' ? `error-${date}.log` : `app-${date}.log`;
  },

  writeToFile: function(level, content) {
    try {
      const fileName = this.getLogFileName(level);
      const stream = this.getLogStream(fileName);
      // 异步写入，不会阻塞事件循环
      if (stream.writable) {
        stream.write(content + '\n');
      }
    } catch (err) {
      console.error('日志写入调度失败:', err.message);
    }
  },

  cleanOldLogs: function() {
    // 异步读取目录，避免阻塞
    fs.readdir(this.logDir, (err, files) => {
      if (err) return;
      const now = Date.now();
      const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000); // 修正：建议保留7-30天，365天太多会影响文件系统性能

      files.forEach(file => {
        if (file.endsWith('.log')) {
          const filePath = path.join(this.logDir, file);
          fs.stat(filePath, (err, stats) => {
            if (!err && stats.mtimeMs < sevenDaysAgo) {
              fs.unlink(filePath, () => {
                // 如果对应的流还开着，关闭它
                if (this.logStreams.has(file)) {
                  this.logStreams.get(file).end();
                  this.logStreams.delete(file);
                }
                console.log(`已异步删除旧日志文件: ${file}`);
              });
            }
          });
        }
      });
    });
  },

  format: function(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message} ${metaStr}`;
  },

  info: function(msg, meta) {
    const formatted = this.format('info', msg, meta);
    console.log(formatted);
    this.writeToFile('info', formatted);
  },

  warn: function(msg, meta) {
    const formatted = this.format('warn', msg, meta);
    console.warn(formatted);
    this.writeToFile('info', formatted);
  },

  error: function(msg, error) {
    const formatted = this.format('error', msg);
    const errorStack = error instanceof Error ? error.stack : JSON.stringify(error);
    const fullError = `${formatted}\n--- SYSTEM ERROR STACK ---\n${errorStack}\n--------------------------`;

    console.error(formatted);
    console.error(`--- SYSTEM ERROR STACK ---\n${errorStack}\n--------------------------`);

    this.writeToFile('info', formatted);
    this.writeToFile('error', fullError);
  }
};

Logger.init();

const app = express();
const PORT = process.env.PORT || 8002;

// ==========================================
// 内存优化：带过期时间的存储
// ==========================================
class CleanupMap extends Map {
  constructor(maxAgeMs = 3600000) { // 默认1小时过期
    super();
    this.maxAgeMs = maxAgeMs;
    this.lastAccess = new Map();

    // 每10分钟清理一次过期数据
    setInterval(() => this.cleanup(), 600000);
  }

  set(key, value) {
    this.lastAccess.set(key, Date.now());
    return super.set(key, value);
  }

  get(key) {
    if (super.has(key)) {
      this.lastAccess.set(key, Date.now()); // 刷新访问时间
    }
    return super.get(key);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, time] of this.lastAccess) {
      if (now - time > this.maxAgeMs) {
        super.delete(key);
        this.lastAccess.delete(key);
      }
    }
  }
}

// 使用优化后的 Map，防止内存泄漏
const conversationStore = new CleanupMap(2 * 60 * 60 * 1000); // 2小时无操作清理
const userTokenStore = new CleanupMap(24 * 60 * 60 * 1000);   // 24小时清理 Token

// ==========================================
// 2. 中间件链 (Middleware Chain)
// ==========================================

app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    // 仅记录慢请求 (>2s) 或 错误请求，减少日志 I/O 压力
    if (duration > 2000 || res.statusCode >= 400) {
      Logger.info(`Request completed`, {
        id: req.requestId,
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip
      });
    }
  });
  next();
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

 // ... (接上一段代码: const asyncHandler = (fn) => ...)

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ==========================================
// 3. 核心业务逻辑 (Core Business Logic)
// ==========================================

/**
 * 封装的 Fetch 请求工具
 * 特性：自动超时控制、连接复用(Agent)、错误处理
 */
const fetchClient = async (url, options = {}, timeout = 30000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // 动态导入 node-fetch
  const fetch = (await import('node-fetch')).default;

  try {
    const response = await fetch(url, {
      ...options,
      agent: url.startsWith('https') ? httpsAgent : undefined, // 使用长连接 Agent
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId); // 清除定时器
  }
};

// 登录获取token的函数
const loginAndGetToken = async () => {
  try {
    const response = await fetchClient('https://jiangsu.codemoss.vip/luomacode-api/user/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        email: '893917884@qq.com',
        password: 'qqlcx5'
      })
    }, 15000); // 登录请求15秒超时

    if (!response.ok) {
      throw new Error(`登录失败: ${response.status}`);
    }

    const data = await response.json();
    if (data.code === 0 && data.loginToken) {
      Logger.info('系统自动登录成功');
      return data.loginToken;
    }
    throw new Error('登录返回数据格式错误');
  } catch (error) {
    Logger.error('登录过程发生异常', error);
    throw error;
  }
};

// Token验证中间件 - OpenAI 兼容错误格式
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: {
        message: 'You didn\'t provide an API key. You need to provide your API key in an Authorization header using Bearer auth.',
        type: 'invalid_request_error',
        param: null,
        code: 'missing_api_key'
      }
    });
  }

  if (token === 'sk-qqlcx5') {
    let realToken = userTokenStore.get('default_user');

    // 双重检查锁定模式（虽然JS是单线程，但await会让出控制权）
    if (!realToken) {
      try {
        Logger.info('检测到默认Key，尝试自动获取Token', { requestId: req.requestId });
        realToken = await loginAndGetToken();
        userTokenStore.set('default_user', realToken);
      } catch (error) {
        return res.status(401).json({
          error: {
            message: 'Incorrect API key provided. Auto login failed.',
            type: 'invalid_request_error',
            param: null,
            code: 'invalid_api_key'
          }
        });
      }
    }
    req.mossToken = realToken;
  } else {
    req.mossToken = token;
  }
  next();
};

const getVersionFromModel = (model) => model?.includes('-tmp') ? '2' : '1';

/**
 * 生成 system_fingerprint（模拟 OpenAI 格式）
 */
const generateFingerprint = () => `fp_${crypto.randomBytes(6).toString('hex')}`;

/**
 * 估算 token 数量（简单实现：约4字符=1 token）
 */
const estimateTokens = (text) => Math.ceil((text || '').length / 4);

/**
 * 统一发送系统消息（适配流式/非流式）- OpenAI 兼容格式
 */
const sendSystemMessage = (res, content, isStream, model, requestId) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const id = `chatcmpl-${requestId}`;
  const systemFingerprint = generateFingerprint();

  if (isStream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Request-ID': requestId
    });

    // 发送内容 chunk
    const contentChunk = {
      id,
      object: 'chat.completion.chunk',
      created: timestamp,
      model: model,
      system_fingerprint: systemFingerprint,
      choices: [{
        index: 0,
        delta: { role: 'assistant', content },
        logprobs: null,
        finish_reason: null
      }]
    };
    res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);

    // 发送结束 chunk（带 finish_reason）
    const endChunk = {
      id,
      object: 'chat.completion.chunk',
      created: timestamp,
      model: model,
      system_fingerprint: systemFingerprint,
      choices: [{
        index: 0,
        delta: {},
        logprobs: null,
        finish_reason: 'stop'
      }]
    };
    res.write(`data: ${JSON.stringify(endChunk)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } else {
    const promptTokens = 10; // 系统消息通常 prompt 很短
    const completionTokens = estimateTokens(content);

    res.json({
      id,
      object: 'chat.completion',
      created: timestamp,
      model: model,
      system_fingerprint: systemFingerprint,
      choices: [{
        index: 0,
        message: { role: 'assistant', content },
        logprobs: null,
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
      }
    });
  }
};

// 创建新会话
const createNewConversation = async (token, model) => {
  try {
    const response = await fetchClient('https://jiangsu.codemoss.vip/luomacode-api/conversation', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'token': token
      },
      body: JSON.stringify({
        title: 'hat_' + Date.now(),
        assistantId: getVersionFromModel(model),
        version: '2'
      })
    }, 10000); // 创建会话10秒超时

    if (!response.ok) throw new Error(`Status ${response.status}`);

    const data = await response.json();
    if (data.code === 0 && data.list?.[0]?.id) {
      return data.list[0].id;
    }
    throw new Error('无效的会话响应');
  } catch (error) {
    Logger.error('创建新会话失败', error);
    throw error;
  }
};

// 辅助函数：判断是否需要重置/重登/免费时间 (逻辑保持不变，为节省篇幅略简写)
const shouldResetConversation = (msgs) => {
  const lastMsg = msgs?.[msgs.length - 1];
  if (!lastMsg) return false;
  const content = formatMessageContent(lastMsg.content);
  return ['重置', 'reset', '1'].includes(content?.trim());
};
const shouldRelogin = (msgs) => {
  const lastMsg = msgs?.[msgs.length - 1];
  if (!lastMsg) return false;
  const content = formatMessageContent(lastMsg.content);
  return ['重新登录', 'login', '登录'].includes(content?.trim()?.toLowerCase());
};
const isFreeTime = () => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const beijingTime = new Date(utc + (3600000 * 8));
  const hour = beijingTime.getHours();
  const day = beijingTime.getDay();
  return {
    isFree: (day === 0 || day === 6) || (hour >= 20 || hour < 8),
    beijingTime
  };
};

/**
 * 从 JSON 字符串中提取平衡的 JSON 对象
 */
const extractBalancedJson = (str, startIdx) => {
  let depth = 0;
  let inString = false;
  let escape = false;
  let start = -1;

  for (let i = startIdx; i < str.length; i++) {
    const char = str[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (char === '"' && !escape) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        return str.substring(start, i + 1);
      }
    }
  }
  return null;
};

/**
 * 从模型响应中解析工具调用
 * 支持多种格式：JSON代码块、直接JSON对象等
 */
const parseToolCalls = (content) => {
  if (!content || typeof content !== 'string') return null;

  // 记录解析尝试（用于调试）
  Logger.info('尝试解析工具调用', { contentLength: content.length, contentPreview: content.substring(0, 200) });

  // 方法1: 查找 "tool_calls" 关键字并提取完整 JSON
  const toolCallsIdx = content.indexOf('"tool_calls"');
  if (toolCallsIdx !== -1) {
    // 向前查找 { 的位置
    let startIdx = toolCallsIdx;
    while (startIdx > 0 && content[startIdx] !== '{') startIdx--;

    if (content[startIdx] === '{') {
      const jsonStr = extractBalancedJson(content, startIdx);
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
            Logger.info('成功解析 tool_calls JSON', { count: parsed.tool_calls.length });
            return parsed.tool_calls.map(tc => ({
              id: tc.id || `call_${crypto.randomBytes(12).toString('hex')}`,
              type: tc.type || 'function',
              function: {
                name: tc.function?.name || tc.name,
                arguments: typeof tc.function?.arguments === 'string'
                  ? tc.function.arguments
                  : JSON.stringify(tc.function?.arguments || tc.arguments || {})
              }
            }));
          }
        } catch (e) {
          Logger.warn('解析 tool_calls JSON 失败', { error: e.message, jsonStr: jsonStr.substring(0, 500) });
        }
      }
    }
  }

  // 方法2: 匹配代码块中的 JSON
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
        Logger.info('从代码块解析 tool_calls', { count: parsed.tool_calls.length });
        return parsed.tool_calls.map(tc => ({
          id: tc.id || `call_${crypto.randomBytes(12).toString('hex')}`,
          type: tc.type || 'function',
          function: {
            name: tc.function?.name || tc.name,
            arguments: typeof tc.function?.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function?.arguments || tc.arguments || {})
          }
        }));
      }
    } catch (e) {
      // 代码块内容不是有效的 tool_calls JSON
    }
  }

  // 方法3: 匹配单个函数调用格式 {"name": "...", "arguments": {...}}
  const singleCallMatch = content.match(/\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:/);
  if (singleCallMatch) {
    const startIdx = content.indexOf(singleCallMatch[0]);
    const jsonStr = extractBalancedJson(content, startIdx);
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        Logger.info('解析单个函数调用', { name: parsed.name });
        return [{
          id: `call_${crypto.randomBytes(12).toString('hex')}`,
          type: 'function',
          function: {
            name: parsed.name,
            arguments: typeof parsed.arguments === 'string'
              ? parsed.arguments
              : JSON.stringify(parsed.arguments || {})
          }
        }];
      } catch (e) {
        // 解析失败
      }
    }
  }

  Logger.info('未检测到工具调用');
  return null;
};

/**
 * 格式化消息内容（处理多模态内容）
 */
const formatMessageContent = (content) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');
  }
  return '';
};

/**
 * 将 tools 定义转换为提示词（用于不原生支持 function calling 的后端）
 */
const toolsToPrompt = (tools) => {
  if (!tools || !Array.isArray(tools) || tools.length === 0) return '';

  const toolDescriptions = tools.map(tool => {
    if (tool.type === 'function' && tool.function) {
      const fn = tool.function;
      const params = fn.parameters?.properties
        ? Object.entries(fn.parameters.properties).map(([name, prop]) =>
            `  - ${name}${fn.parameters.required?.includes(name) ? ' (required)' : ''}: ${prop.description || prop.type}`
          ).join('\n')
        : '';
      return `### ${fn.name}\n${fn.description || ''}\nParameters:\n${params}`;
    }
    return '';
  }).filter(Boolean).join('\n\n');

  return `
# CRITICAL INSTRUCTIONS FOR TOOL USE

You MUST use tools to complete tasks. DO NOT provide text explanations without using a tool.

## How to Use Tools
When you need to perform an action, respond with ONLY a JSON object in this exact format (no other text):

{"tool_calls":[{"id":"call_${Date.now()}","type":"function","function":{"name":"TOOL_NAME","arguments":"{\\"param1\\":\\"value1\\"}"}}]}

## Available Tools
${toolDescriptions}

## IMPORTANT RULES
1. You MUST respond with the JSON format above when using a tool
2. The "arguments" field MUST be a JSON string (with escaped quotes)
3. DO NOT add any text before or after the JSON
4. If you need to use a tool, use it immediately - do not ask for confirmation

`;
};

/**
 * 格式转换函数 - 支持完整的消息历史和 tools
 */
const convertToMossFormat = (reqBody, token, convId) => {
  const { messages, tools, tool_choice } = reqBody;

  // 构建完整的 prompt，包含所有消息历史
  let fullPrompt = '';

  // 处理消息
  for (const msg of messages) {
    const content = formatMessageContent(msg.content);
    if (msg.role === 'system') {
      fullPrompt += `[System]: ${content}\n\n`;
    } else if (msg.role === 'user') {
      fullPrompt += `[User]: ${content}\n\n`;
    } else if (msg.role === 'assistant') {
      fullPrompt += `[Assistant]: ${content}\n\n`;
    } else if (msg.role === 'tool') {
      fullPrompt += `[Tool Result (${msg.tool_call_id})]: ${content}\n\n`;
    }
  }

  // 如果有 tools，添加工具描述到 prompt
  if (tools && tools.length > 0) {
    // 在 prompt 开头添加工具信息
    const toolsPrompt = toolsToPrompt(tools);
    fullPrompt = toolsPrompt + fullPrompt;

    // 如果 tool_choice 要求必须调用工具
    if (tool_choice === 'required' || (tool_choice && tool_choice !== 'none' && tool_choice !== 'auto')) {
      fullPrompt += '\n[Important]: You MUST use one of the available tools to respond. Do not provide a text response without using a tool.\n';
    }
  }

  return {
    url: 'https://jiangsu.codemoss.vip/luomacode-api/v3/moss/completions',
    headers: { 'content-type': 'application/json', 'token': token },
    body: JSON.stringify({
      prompt: fullPrompt.trim(),
      options: {
        conversationId: convId,
        openaiVersion: reqBody.model.replace('-tmp', '') || 'gpt-4o-mini',
        assistantId: getVersionFromModel(reqBody.model),
        version: '2',
        nonce: `hp_${Math.floor(Math.random() * 100000000)}`
      }
    })
  };
};

// ==========================================
// 4. API 路由定义 (API Routes)
// ==========================================

app.post('/v1/chat/completions', authenticateToken, asyncHandler(async (req, res) => {
  let { stream, messages, model } = req.body;
  const requestId = req.requestId;
  const userKey = req.mossToken;

  if (!messages || !Array.isArray(messages)) throw new Error('Messages array required');

  // 免费时间逻辑
  const freeInfo = isFreeTime();
  if (freeInfo.isFree && model !== 'gpt-4o-2024-05-13') {
    model = 'gpt-4o-2024-05-13';
    req.body.model = model;
  }

  // 重新登录逻辑
  if (shouldRelogin(messages) && req.mossToken !== 'sk-qqlcx5') {
     return sendSystemMessage(res, "非默认key无法自动重登，请重新登录。" + req.mossToken, stream, model, requestId);
  } else if (shouldRelogin(messages)) {
    userTokenStore.delete('default_user'); // 强制清理缓存
    req.mossToken = await loginAndGetToken();
    userTokenStore.set('default_user', req.mossToken);
    return sendSystemMessage(res, "已重新登录，请重试。", stream, model, requestId);
  }

  // 会话管理
  let conversationId = conversationStore.get(userKey);
  if (!conversationId || shouldResetConversation(messages)) {
    conversationId = await createNewConversation(req.mossToken, model);
    conversationStore.set(userKey, conversationId);
    if (shouldResetConversation(messages)) {
      return sendSystemMessage(res, `会话ID已失效，新的会话 ID: ${conversationId} 已创建 ，请重新提问~~`, stream, model, requestId);
    }
  }

  // 构造 Moss 请求
  const mossRequest = convertToMossFormat(req.body, req.mossToken, conversationId);

  // 发起请求 - 注意这里不设置超时或设置较长超时，因为LLM生成慢
  // 如果是流式，我们需要拿到原始的 response body stream
  const fetch = (await import('node-fetch')).default;

  // 使用 AbortController 处理客户端断开连接的情况
  const controller = new AbortController();
  req.on('close', () => {
    controller.abort(); // 客户端断开时，中止上游请求，节省资源
    Logger.info('客户端连接断开，中止上游请求', { requestId });
  });

  const response = await fetch(mossRequest.url, {
    method: 'POST',
    headers: mossRequest.headers,
    agent: httpsAgent,
    body: mossRequest.body,
    signal: controller.signal
  });

  if (!response.ok) {
    throw new Error(`Moss API Error: ${response.status}`);
  }

  // OpenAI 兼容格式的公共字段
  const responseId = `chatcmpl-${requestId}`;
  const systemFingerprint = generateFingerprint();
  const created = Math.floor(Date.now() / 1000);

  // 计算 prompt tokens（简单估算）
  const promptText = messages.map(m => m.content || '').join(' ');
  const promptTokens = estimateTokens(promptText);

  if (stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Request-ID': requestId
    });

    const reader = response.body;
    let buffer = '';
    let fullContent = ''; // 累积完整响应内容
    let isFirstChunk = true;
    let sentContent = ''; // 已发送给客户端的内容
    let isToolCallMode = false; // 是否检测到工具调用模式
    let toolCallBuffer = ''; // 缓冲工具调用内容

    /**
     * 检测内容是否像工具调用的开头
     */
    const looksLikeToolCall = (content) => {
      const trimmed = content.trim();
      // 检测 {"tool_calls": 或 {"name": 格式
      return trimmed.startsWith('{"tool_calls"') ||
             trimmed.startsWith('{"name"') ||
             trimmed.startsWith('```json\n{"tool_calls"') ||
             trimmed.startsWith('```\n{"tool_calls"');
    };

    /**
     * 发送文本内容 chunk
     */
    const sendContentChunk = (content) => {
      if (!content || res.writableEnded) return;

      const streamData = {
        id: responseId,
        object: 'chat.completion.chunk',
        created,
        model: model,
        system_fingerprint: systemFingerprint,
        choices: [{
          index: 0,
          delta: isFirstChunk ? { role: 'assistant', content } : { content },
          logprobs: null,
          finish_reason: null
        }]
      };
      res.write(`data: ${JSON.stringify(streamData)}\n\n`);
      isFirstChunk = false;
      sentContent += content;
    };

    /**
     * 发送工具调用（OpenAI 流式格式）
     */
    const sendToolCallsStream = (toolCalls) => {
      if (!toolCalls || toolCalls.length === 0 || res.writableEnded) return;

      // 按照 OpenAI 流式格式，需要分多个 chunk 发送
      // 第一个 chunk：发送 role 和 tool_calls 的基本信息
      for (let idx = 0; idx < toolCalls.length; idx++) {
        const tc = toolCalls[idx];

        // 发送工具调用的开始（id, type, function.name）
        const startChunk = {
          id: responseId,
          object: 'chat.completion.chunk',
          created,
          model: model,
          system_fingerprint: systemFingerprint,
          choices: [{
            index: 0,
            delta: isFirstChunk ? {
              role: 'assistant',
              content: null,
              tool_calls: [{
                index: idx,
                id: tc.id,
                type: tc.type,
                function: {
                  name: tc.function.name,
                  arguments: ''
                }
              }]
            } : {
              tool_calls: [{
                index: idx,
                id: tc.id,
                type: tc.type,
                function: {
                  name: tc.function.name,
                  arguments: ''
                }
              }]
            },
            logprobs: null,
            finish_reason: null
          }]
        };
        res.write(`data: ${JSON.stringify(startChunk)}\n\n`);
        isFirstChunk = false;

        // 分块发送 arguments（模拟流式输出）
        const args = tc.function.arguments || '{}';
        const chunkSize = 50; // 每次发送50个字符
        for (let i = 0; i < args.length; i += chunkSize) {
          const argChunk = args.substring(i, Math.min(i + chunkSize, args.length));
          const argsChunkData = {
            id: responseId,
            object: 'chat.completion.chunk',
            created,
            model: model,
            system_fingerprint: systemFingerprint,
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index: idx,
                  function: {
                    arguments: argChunk
                  }
                }]
              },
              logprobs: null,
              finish_reason: null
            }]
          };
          res.write(`data: ${JSON.stringify(argsChunkData)}\n\n`);
        }
      }
    };

    reader.on('data', (chunk) => {
      // 检查客户端是否还在连接
      if (res.writableEnded) {
        reader.destroy();
        return;
      }

      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          // 错误处理
          if (typeof parsed?.code === 'number' && parsed.code !== 0) {
            const errChunk = {
              id: responseId,
              object: 'chat.completion.chunk',
              created,
              model: model,
              system_fingerprint: systemFingerprint,
              choices: [{
                index: 0,
                delta: { content: `Error: ${parsed.msg}` },
                logprobs: null,
                finish_reason: null
              }]
            };
            res.write(`data: ${JSON.stringify(errChunk)}\n\n`);
            continue;
          }

          const content = parsed?.msgItem?.theContent || '';
          if (content) {
            fullContent += content;

            // 检测是否是工具调用模式
            if (!isToolCallMode && sentContent.length === 0) {
              // 还没发送任何内容，检查累积的内容是否像工具调用
              if (looksLikeToolCall(fullContent)) {
                isToolCallMode = true;
                Logger.info('检测到工具调用模式，开始缓冲', { contentPreview: fullContent.substring(0, 100) });
              }
            }

            if (isToolCallMode) {
              // 工具调用模式：缓冲内容，不直接发送
              toolCallBuffer = fullContent;
            } else {
              // 普通文本模式：直接发送
              sendContentChunk(content);
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    });

    reader.on('end', () => {
      if (!res.writableEnded) {
        // 检测完整内容是否包含工具调用
        const toolCalls = parseToolCalls(fullContent);

        if (toolCalls && toolCalls.length > 0) {
          Logger.info('解析到工具调用，准备发送', { count: toolCalls.length });

          // 如果之前是工具调用模式，内容还没发送，现在以正确格式发送
          // 如果之前不是工具调用模式但检测到了工具调用，说明工具调用混在文本中
          // 无论哪种情况，都发送工具调用

          // 发送工具调用
          sendToolCallsStream(toolCalls);

          // 发送结束 chunk（带 finish_reason: tool_calls）
          const endChunk = {
            id: responseId,
            object: 'chat.completion.chunk',
            created,
            model: model,
            system_fingerprint: systemFingerprint,
            choices: [{
              index: 0,
              delta: {},
              logprobs: null,
              finish_reason: 'tool_calls'
            }]
          };
          res.write(`data: ${JSON.stringify(endChunk)}\n\n`);
        } else {
          // 如果是工具调用模式但解析失败，需要把缓冲的内容作为普通文本发送
          if (isToolCallMode && toolCallBuffer) {
            Logger.warn('工具调用解析失败，作为普通文本发送', { contentLength: toolCallBuffer.length });
            sendContentChunk(toolCallBuffer);
          }

          // 发送结束 chunk（带 finish_reason: stop）- OpenAI 标准格式
          const endChunk = {
            id: responseId,
            object: 'chat.completion.chunk',
            created,
            model: model,
            system_fingerprint: systemFingerprint,
            choices: [{
              index: 0,
              delta: {},
              logprobs: null,
              finish_reason: 'stop'
            }]
          };
          res.write(`data: ${JSON.stringify(endChunk)}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();
      }
    });

    reader.on('error', (err) => {
      if (err.name !== 'AbortError') {
        Logger.error('Stream Error', err);
      }
      if (!res.writableEnded) res.end();
    });

  } else {
    const data = await response.json();
    const content = data.content || data.text || '';
    const completionTokens = estimateTokens(content);

    // 检测是否包含工具调用
    const toolCalls = parseToolCalls(content);

    // 构建消息对象
    const message = { role: 'assistant' };

    if (toolCalls && toolCalls.length > 0) {
      // 如果检测到工具调用，设置 tool_calls 并清空 content
      message.content = null;
      message.tool_calls = toolCalls;
    } else {
      message.content = content;
    }

    // OpenAI 兼容的非流式响应格式
    const openaiResp = {
      id: responseId,
      object: 'chat.completion',
      created,
      model: model,
      system_fingerprint: systemFingerprint,
      choices: [{
        index: 0,
        message,
        logprobs: null,
        finish_reason: toolCalls ? 'tool_calls' : 'stop'
      }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
      }
    };
    res.json(openaiResp);
  }
}));

// ==========================================
// OpenAI 兼容端点
// ==========================================

/**
 * 获取可用模型列表 - OpenAI /v1/models 兼容
 */
app.get('/v1/models', (req, res) => {
  const models = [
    // 初级模型
    { id: 'gpt-4o-mini', owned_by: 'openai', created: 1686935002 },
    { id: '3.5-16k', owned_by: 'openai', created: 1686935002 },
    // 中级模型
    { id: 'moonshot-v1-8k', owned_by: 'moonshot', created: 1686935002 },
    // 增强模型
    { id: 'gpt-4o-2024-05-13', owned_by: 'openai', created: 1686935002 },
    { id: '4.0', owned_by: 'openai', created: 1686935002 },
    { id: 'deepseek-chat', owned_by: 'deepseek', created: 1686935002 },
    { id: 'gemini-pro', owned_by: 'google', created: 1686935002 },
    { id: 'ERNIE-Bot-4', owned_by: 'baidu', created: 1686935002 },
    { id: 'chatglm_pro', owned_by: 'zhipu', created: 1686935002 },
    { id: 'qwen-plus-v1', owned_by: 'alibaba', created: 1686935002 },
    { id: 'SparkDesk', owned_by: 'iflytek', created: 1686935002 },
    // 高级模型
    { id: 'o1-preview', owned_by: 'openai', created: 1686935002 },
    { id: 'Pro/deepseek-ai/DeepSeek-R1', owned_by: 'deepseek', created: 1686935002 },
    { id: 'claude-sonnet-4-20250514', owned_by: 'anthropic', created: 1686935002 },
    // 其他模型
    { id: 'gpt-4o-image', owned_by: 'openai', created: 1686935002 }
  ];

  res.json({
    object: 'list',
    data: models.map(m => ({
      id: m.id,
      object: 'model',
      created: m.created,
      owned_by: m.owned_by,
      permission: [],
      root: m.id,
      parent: null
    }))
  });
});

/**
 * 获取单个模型信息 - OpenAI /v1/models/:model 兼容
 */
app.get('/v1/models/:model', (req, res) => {
  const modelId = req.params.model;
  const knownModels = [
    'gpt-4o-mini', '3.5-16k', 'moonshot-v1-8k', 'gpt-4o-2024-05-13', '4.0',
    'deepseek-chat', 'gemini-pro', 'ERNIE-Bot-4', 'chatglm_pro', 'qwen-plus-v1',
    'SparkDesk', 'o1-preview', 'Pro/deepseek-ai/DeepSeek-R1',
    'claude-sonnet-4-20250514', 'gpt-4o-image'
  ];

  if (!knownModels.includes(modelId)) {
    return res.status(404).json({
      error: {
        message: `The model '${modelId}' does not exist`,
        type: 'invalid_request_error',
        param: 'model',
        code: 'model_not_found'
      }
    });
  }

  res.json({
    id: modelId,
    object: 'model',
    created: 1686935002,
    owned_by: 'codemoss',
    permission: [],
    root: modelId,
    parent: null
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', memory: process.memoryUsage(), connections: server.getConnections ? "available" : "unknown" });
});

// 全局错误处理 - OpenAI 兼容格式
app.use((err, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  if (err.name === 'AbortError') {
    Logger.warn(`Request Aborted`, { requestId });
    return; // 忽略中断错误
  }
  Logger.error(`API Error`, err);
  if (!res.headersSent) {
    // OpenAI 兼容的错误响应格式
    const statusCode = err.statusCode || 500;
    const errorType = statusCode >= 500 ? 'server_error' : 'invalid_request_error';

    res.status(statusCode).json({
      error: {
        message: err.message || 'An unexpected error occurred',
        type: errorType,
        param: err.param || null,
        code: err.code || (statusCode >= 500 ? 'internal_error' : 'invalid_request')
      }
    });
  }
});

// ==========================================
// 5. 启动与进程守护
// ==========================================

const server = app.listen(PORT, () => {
  Logger.info(`🚀 Optimized Server running on port ${PORT}`);
});

// 设置服务器超时，防止死连接
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// 优雅停机
const gracefulShutdown = (signal) => {
  Logger.info(`${signal} received. Closing server...`);

  // 停止接收新请求
  server.close(() => {
    Logger.info('HTTP server closed.');
    // 销毁所有 Agent 连接
    httpsAgent.destroy();
    process.exit(0);
  });

  // 强制超时
  setTimeout(() => {
    console.error('Forcing shutdown...');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  Logger.error('Uncaught Exception', err);
  // 生产环境建议退出重启
});

process.on('unhandledRejection', (reason) => {
  Logger.error('Unhandled Rejection', reason instanceof Error ? reason : new Error(String(reason)));
});

module.exports = app;
