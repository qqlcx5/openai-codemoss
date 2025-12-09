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

// Token验证中间件
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: { message: 'Missing token', code: 'missing_token' } });
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
        return res.status(401).json({ error: { message: '自动登录失败', code: 'login_failed' } });
      }
    }
    req.mossToken = realToken;
  } else {
    req.mossToken = token;
  }
  next();
};

const getVersionFromModel = (model) => model?.includes('-tmp') ? '2' : '1';

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
const shouldResetConversation = (msgs) => ['重置', 'reset', '1'].includes(msgs?.[msgs.length-1]?.content?.trim());
const shouldRelogin = (msgs) => ['重新登录', 'login', '登录'].includes(msgs?.[msgs.length-1]?.content?.trim()?.toLowerCase());
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

// 格式转换函数 (保持原有逻辑，去除无用的大量日志)
const convertToMossFormat = (reqBody, token, convId) => {
  // ... (保持原有逻辑)
  const userMsg = reqBody.messages.filter(m => m.role === 'user').pop();
  return {
    url: 'https://jiangsu.codemoss.vip/luomacode-api/v3/moss/completions',
    headers: { 'content-type': 'application/json', 'token': token },
    body: JSON.stringify({
      prompt: userMsg ? userMsg.content : '',
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
     // ... (非默认key无法自动重登，忽略)
  } else if (shouldRelogin(messages)) {
    userTokenStore.delete('default_user'); // 强制清理缓存
    req.mossToken = await loginAndGetToken();
    userTokenStore.set('default_user', req.mossToken);
    return res.json({ choices: [{ message: { content: "已重新登录，请重试。" } }] });
  }

  // 会话管理
  let conversationId = conversationStore.get(userKey);
  if (!conversationId || shouldResetConversation(messages)) {
    conversationId = await createNewConversation(req.mossToken, model);
    conversationStore.set(userKey, conversationId);
    if (shouldResetConversation(messages)) {
      return res.json({ choices: [{ message: { content: "会话已重置。" } }] });
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
    headers: { ...mossRequest.headers, agent: httpsAgent }, // 使用 Agent
    body: mossRequest.body,
    signal: controller.signal
  });

  if (!response.ok) {
    throw new Error(`Moss API Error: ${response.status}`);
  }

  if (stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Request-ID': requestId
    });

    const reader = response.body;
    let buffer = '';

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
            const errChunk = { choices: [{ delta: { content: `Error: ${parsed.msg}` } }] };
            res.write(`data: ${JSON.stringify(errChunk)}\n\n`);
            continue;
          }

          const content = parsed?.msgItem?.theContent || '';
          if (content) {
            const streamData = {
              id: `chatcmpl-${requestId}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: model,
              choices: [{ delta: { content }, index: 0, finish_reason: null }]
            };
            res.write(`data: ${JSON.stringify(streamData)}\n\n`);
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    });

    reader.on('end', () => {
      if (!res.writableEnded) {
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
    const openaiResp = {
      id: `chatcmpl-${requestId}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [{
        message: { role: 'assistant', content: data.content || data.text || '' },
        finish_reason: 'stop',
        index: 0
      }]
    };
    res.json(openaiResp);
  }
}));

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', memory: process.memoryUsage(), connections: server.getConnections ? "available" : "unknown" });
});

// 全局错误处理
app.use((err, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  if (err.name === 'AbortError') {
    Logger.warn(`Request Aborted`, { requestId });
    return; // 忽略中断错误
  }
  Logger.error(`API Error`, err);
  if (!res.headersSent) {
    res.status(500).json({ error: { message: err.message || 'Internal Error', type: 'server_error' } });
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
