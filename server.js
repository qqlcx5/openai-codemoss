/**
 * Server.js - Enterprise Edition
 * 增强内容：日志系统、错误堆栈输出、优雅停机、请求追踪、输入校验
 * 原有功能完全保留
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto'); // 用于生成RequestID
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ==========================================
// 1. 基础工具与配置 (Infrastructure)
// ==========================================

/**
 * 增强日志工具 - 支持文件日志和控制台输出
 */
const Logger = {
  // 日志目录
  logDir: path.join(__dirname, 'logs'),

  // 初始化日志目录
  init: function() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  },

  // 获取日志文件名（按天轮转）
  getLogFileName: function(level) {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return level === 'error' ? `error-${date}.log` : `app-${date}.log`;
  },

  // 写入文件日志
  writeToFile: function(level, content) {
    try {
      const fileName = this.getLogFileName(level);
      const filePath = path.join(this.logDir, fileName);
      fs.appendFileSync(filePath, content + '\n', 'utf8');

      // 清理7天前的日志文件
      this.cleanOldLogs();
    } catch (err) {
      // 如果文件写入失败，只输出到控制台，避免影响主程序
      console.error('日志文件写入失败:', err.message);
    }
  },

  // 清理旧日志（保留365天）
  cleanOldLogs: function() {
    try {
      const files = fs.readdirSync(this.logDir);
      const now = Date.now();
      const sevenDaysAgo = now - (365 * 24 * 60 * 60 * 1000);

      files.forEach(file => {
        if (file.endsWith('.log')) {
          const filePath = path.join(this.logDir, file);
          const stats = fs.statSync(filePath);
          if (stats.mtimeMs < sevenDaysAgo) {
            fs.unlinkSync(filePath);
            console.log(`已删除旧日志文件: ${file}`);
          }
        }
      });
    } catch {
      // 清理失败不影响主程序
    }
  },

  // 格式化日志
  format: function(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message} ${metaStr}`;
  },

  // INFO级别日志
  info: function(msg, meta) {
    const formatted = this.format('info', msg, meta);
    console.log(formatted);
    this.writeToFile('info', formatted);
  },

  // WARN级别日志
  warn: function(msg, meta) {
    const formatted = this.format('warn', msg, meta);
    console.warn(formatted);
    this.writeToFile('info', formatted); // WARN也写入app.log
  },

  // ERROR级别日志
  error: function(msg, error) {
    const formatted = this.format('error', msg);
    const errorStack = error instanceof Error ? error.stack : JSON.stringify(error);
    const fullError = `${formatted}\n--- SYSTEM ERROR STACK ---\n${errorStack}\n--------------------------`;

    console.error(formatted);
    console.error(`--- SYSTEM ERROR STACK ---\n${errorStack}\n--------------------------`);

    // 同时写入app.log和error.log
    this.writeToFile('info', formatted);
    this.writeToFile('error', fullError);
  }
};

// 初始化日志目录
Logger.init();

const app = express();
const PORT = process.env.PORT || 8002;

// 存储会话ID的内存存储（生产环境建议使用Redis或数据库）
const conversationStore = new Map();
// 存储用户token的内存存储
const userTokenStore = new Map();

// ==========================================
// 2. 中间件链 (Middleware Chain)
// ==========================================

// 2.1 请求追踪中间件
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  next();
});

// 2.2 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    Logger.info(`Request completed`, {
      id: req.requestId,
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    });
  });
  next();
});

app.use(cors());
app.use(express.json({ limit: '10mb' })); // 增加body大小限制防止溢出

// 2.3 异常捕获中间件 (Async Wrapper)
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ==========================================
// 3. 核心业务逻辑 (Core Business Logic)
// ==========================================

// 登录获取token的函数
const loginAndGetToken = async () => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://jiangsu.codemoss.vip/luomacode-api/user/login', {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'zh-CN,zh;q=0.9',
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        'origin': 'https://pc.aihao123.cn',
        'pragma': 'no-cache',
        'priority': 'u=1, i',
        'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'cross-site',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        email: '893917884@qq.com',
        password: 'qqlcx5'
      })
    });

    if (!response.ok) {
      throw new Error(`登录失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.code === 0 && data.loginToken) {
      Logger.info('系统自动登录成功');
      return data.loginToken;
    } else {
      throw new Error('登录返回数据格式错误' + JSON.stringify(data));
    }
  } catch (error) {
    Logger.error('登录过程发生异常', error);
    throw error;
  }
};

// Token验证中间件
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    Logger.warn('请求缺少Token', { requestId: req.requestId });
    return res.status(401).json({
      error: {
        message: 'Missing authorization token',
        type: 'authentication_error',
        code: 'missing_token'
      }
    });
  }

  // 如果token是sk-qqlcx5，则忽略不使用
  if (token === 'sk-qqlcx5') {
    // 尝试从存储中获取真实token，如果没有则重新登录
    let realToken = userTokenStore.get('default_user');
    if (!realToken) {
      try {
        Logger.info('检测到默认Key，尝试自动获取Token', { requestId: req.requestId });
        realToken = await loginAndGetToken();
        userTokenStore.set('default_user', realToken);
      } catch (error) {
        Logger.error('自动登录失败', error);
        return res.status(401).json({
          error: {
            message: `自动登录失败，请重试 error: ${error.message}`,
            type: 'authentication_error',
            code: 'login_failed'
          }
        });
      }
    }
    req.mossToken = realToken;
  } else {
    // 使用提供的token
    req.mossToken = token;
  }

  next();
};

// 根据模型名称确定版本参数
const getVersionFromModel = (model) => {
  return model?.includes('-tmp') ? '2' : '1';
};

// 创建新会话的函数
const createNewConversation = async (token, model) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://jiangsu.codemoss.vip/luomacode-api/conversation', {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'zh-CN,zh;q=0.9',
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        'pragma': 'no-cache',
        'priority': 'u=1, i',
        'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'cross-site',
        'token': token
      },
      body: JSON.stringify({
        title: 'hat_' + new Date().toISOString() + '_问题',
        assistantId: getVersionFromModel(model),
        version: '2'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`创建会话失败: ${response.status} ${response.statusText} ${errorText}`);
    }

    const data = await response.json();
    if (data.code === 0 && data.list && data.list.length > 0) {
      Logger.info('新会话创建成功', { conversationId: data.list[0].id });
      return data.list[0].id;
    } else {
      throw new Error('创建会话返回数据格式错误: ' + JSON.stringify(data));
    }
  } catch (error) {
    Logger.error('创建新会话时出错', error);
    throw new Error('创建新会话时出错: ' + error.message);
  }
};

// 检查是否需要重置会话
const shouldResetConversation = (messages) => {
  if (!messages || messages.length === 0) return false;

  const lastUserMessage = messages
    .filter(msg => msg.role === 'user')
    .pop();

  if (!lastUserMessage) return false;

  const content = lastUserMessage.content.trim();
  return content === '重置' || content === 'reset' || content === '1';
};

// 检查是否需要重新登录
const shouldRelogin = (messages) => {
  if (!messages || messages.length === 0) return false;

  const lastUserMessage = messages
    .filter(msg => msg.role === 'user')
    .pop();

  if (!lastUserMessage) return false;

  const content = lastUserMessage.content.trim().toLowerCase();
  return content === '重新登录' || content === 'login' || content === '登录';
};

// 检查是否在免费时间段（晚上8点到早上8点，或周末全天）
const isFreeTime = () => {
  try {
    const now = new Date();
    // 转换为北京时间 (UTC+8)
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const beijingTime = new Date(utc + (3600000 * 8));
    const hour = beijingTime.getHours();
    const day = beijingTime.getDay(); // 0是周日，6是周六

    // 判断条件：周末全天 或 晚上8点到早上8点
    const isWeekend = day === 0 || day === 6;
    const isNight = hour >= 20 || hour < 8;

    return {
      isFree: isWeekend || isNight,
      isWeekend: isWeekend,
      isNight: isNight,
      beijingTime: beijingTime
    };
  } catch (error) {
    Logger.error('免费时间判断异常', error);
    return { isFree: false, isWeekend: false, isNight: false, beijingTime: new Date() };
  }
};

// OpenAI格式到moss格式的转换函数
const convertToMossFormat = (openaiRequest, mossToken, conversationId) => {
  const { messages, model } = openaiRequest;

  // 提取最后一条用户消息作为prompt
  const userMessages = messages.filter(msg => msg.role === 'user');
  const prompt = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '';

  // 根据模型确定版本
  const assistantId = getVersionFromModel(model);
  // 如果模型有去除 -tmp 后缀
  const modelName = model.replace('-tmp', '');
  return {
    url: 'https://jiangsu.codemoss.vip/luomacode-api/v3/moss/completions',
    headers: {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9',
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'pragma': 'no-cache',
      'priority': 'u=1, i',
      'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'cross-site',
      'token': mossToken
    },
    body: JSON.stringify({
      prompt: prompt,
      options: {
        openCot: false,
        appId: null,
        nonce: `hp_${Math.floor(Math.random() * 100000000)}`,
        conversationId: conversationId,
        openaiVersion: modelName || 'gpt-4o-mini',
        datasetIds: [],
        voice: false,
        image: false,
        assistantId: assistantId,
        version: '2'
      },
      apiKey: null
    })
  };
};

// moss响应到OpenAI格式的转换函数
const convertToOpenAIFormat = (mossResponse, model = 'gpt-4o-mini') => {
  const timestamp = Math.floor(Date.now() / 1000);
  const id = `chatcmpl-${Math.random().toString(36).substr(2, 9)}`;

  return {
    id: id,
    object: 'chat.completion',
    created: timestamp,
    model: model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: mossResponse.content || mossResponse.text || mossResponse.response || ''
      },
      finish_reason: 'stop'
    }],
    usage: {
      prompt_tokens: mossResponse.usage?.prompt_tokens || 0,
      completion_tokens: mossResponse.usage?.completion_tokens || 0,
      total_tokens: mossResponse.usage?.total_tokens || 0
    }
  };
};

// 流式响应转换函数
const convertToOpenAIStream = (chunk, model = 'gpt-4o-mini') => {
  const timestamp = Math.floor(Date.now() / 1000);
  const id = `chatcmpl-${Math.random().toString(36).substr(2, 9)}`;

  return {
    id: id,
    object: 'chat.completion.chunk',
    created: timestamp,
    model: model,
    choices: [{
      index: 0,
      delta: {
        content: chunk
      },
      finish_reason: null
    }]
  };
};

// ==========================================
// 4. API 路由定义 (API Routes)
// ==========================================

// 主要的代理端点
app.post('/v1/chat/completions', authenticateToken, asyncHandler(async (req, res) => {
  let { stream, messages, model } = req.body;
  const requestId = req.requestId;
  const userKey = req.mossToken; // 使用token作为用户标识

  // 输入校验
  if (!messages || !Array.isArray(messages)) {
    throw new Error('Messages array is required');
  }

  // ==========================================
  // 福利逻辑：夜间(20:00-08:00)和周末全天自动升级模型
  // ==========================================
  const freeTimeInfo = isFreeTime();
  if (freeTimeInfo.isFree) {
    const freeModel = 'gpt-4o-2024-05-13';
    // 仅当当前模型不是目标模型时才升级，避免重复日志
    if (model !== freeModel) {
      const triggerReason = freeTimeInfo.isWeekend ? '周末免费' : '夜间免费(20:00-08:00)';
      Logger.info(`[福利时间] 自动升级模型: ${model} -> ${freeModel}`, {
        requestId,
        reason: triggerReason,
        beijingTime: freeTimeInfo.beijingTime.toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
      });

      model = freeModel;
      req.body.model = freeModel; // 确保后续 convertToMossFormat 使用新模型
    }
  }
  // ==========================================

  Logger.info(`接收到聊天请求 [${model}]`, { requestId, stream });

  // 检查是否需要重新登录
  if (shouldRelogin(messages) && req.mossToken === 'sk-qqlcx5') {
    try {
      Logger.info('触发强制重新登录', { requestId });
      const newToken = await loginAndGetToken();
      userTokenStore.set('default_user', newToken);
      req.mossToken = newToken; // 更新当前请求的token
      let errorMessage = `账号过期，已重新登录成功，请重新提问~~`;
      const streamChunk = convertToOpenAIStream(errorMessage, model);
      res.write(`data: ${JSON.stringify(streamChunk)}\n\n`);
      res.end();
      return;

    } catch (error) {
      Logger.error('强制重新登录失败', error);
      throw error; // 交给全局错误处理器
    }
  }

  let conversationId = conversationStore.get(userKey);

  // 检查是否需要重置会话或创建新会话
  if (!conversationId || shouldResetConversation(messages)) {
    try {
      const newConversationId = await createNewConversation(req.mossToken, model);
      conversationStore.set(userKey, newConversationId);
      Logger.info(`会话已重置/创建: ${newConversationId}`, { requestId });

      let errorMessage = `会话ID已失效，新的会话 ID: ${newConversationId} 已创建 ，请重新提问~~`;
      const streamChunk = convertToOpenAIStream(errorMessage, model);
      res.write(`data: ${JSON.stringify(streamChunk)}\n\n`);
      res.end();
      return;
    } catch (error) {
      Logger.error('会话创建失败', error);
      return res.status(500).json({
        error: {
          message: '创建会话失败，请重新发送请求 重置',
          type: 'conversation_error',
          code: 'create_conversation_failed'
        }
      });
    }
  }

  const mossRequest = convertToMossFormat(req.body, req.mossToken, conversationId);
  Logger.info(`Proxying to Moss API: ${conversationId}`, { requestId });

  const fetch = (await import('node-fetch')).default;
  const response = await fetch(mossRequest.url, {
    method: 'POST',
    headers: mossRequest.headers,
    body: mossRequest.body
  });

  if (!response.ok) {
    throw new Error(`Moss API error: ${response.status} ${response.statusText}`);
  }

  if (stream) {
    // 流式响应处理
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
      'X-Request-ID': requestId
    });

    const reader = response.body;
    let buffer = '';

    reader.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留最后一个不完整的行

      for (const line of lines) {
        if (line.trim()) {
          try {
            // 处理moss流式数据并转换为OpenAI格式
            const parsedChunk = JSON.parse(line)
            if(typeof parsedChunk?.code == 'number') {
              let errorMessage = parsedChunk.msg || parsedChunk.content || '服务暂时不可用~~';
              Logger.warn(`Moss API Error Chunk: ${errorMessage}`, { requestId });
              const streamChunk = convertToOpenAIStream(errorMessage, model);
              res.write(`data: ${JSON.stringify(streamChunk)}\n\n`);
              res.end();
              return;
            }
            const aggregatedContent = parsedChunk?.msgItem?.theContent || ''
            const streamChunk = convertToOpenAIStream(aggregatedContent, model);
            res.write(`data: ${JSON.stringify(streamChunk)}\n\n`);
          } catch (e) {
            Logger.error('Error processing stream chunk', e);
          }
        }
      }
    });

    reader.on('end', () => {
      Logger.info('Stream completed', { requestId });
      res.write('data: [DONE]\n\n');
      res.end();
    });

    reader.on('error', (error) => {
      Logger.error('Stream processing error', error);
      res.end();
    });

  } else {
    // 非流式响应处理
    const mossData = await response.json();
    const openaiResponse = convertToOpenAIFormat(mossData, model);
    res.json(openaiResponse);
  }
}));

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// 获取模型列表端点（兼容OpenAI API）
app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [
      {
        id: 'gpt-4o-mini',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'moss-proxy'
      },
      {
        id: 'gpt-4o',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'moss-proxy'
      },
      {
        id: 'gpt-4o-tmp',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'moss-proxy'
      }
    ]
  });
});

// ==========================================
// 5. 全局错误处理 (Global Error Handling)
// ==========================================

// 404 处理
app.use((req, res) => {
  Logger.warn(`404 Not Found: ${req.method} ${req.url}`);
  res.status(404).json({
    error: {
      message: 'Endpoint not found',
      type: 'invalid_request_error',
      code: 'resource_missing'
    }
  });
});

// 500 全局异常处理
app.use((err, req, res, _next) => {
  const requestId = req.requestId || 'unknown';
  Logger.error(`Unhandled Exception RequestID:[${requestId}]`, err);

  // 确保不向客户端泄露敏感堆栈，但在控制台输出完整堆栈
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      type: 'server_error',
      code: 'internal_error',
      request_id: requestId // 方便追踪
    }
  });
});

// ==========================================
// 6. 启动与进程守护 (Startup & Guard)
// ==========================================

const server = app.listen(PORT, () => {
  Logger.info(`🚀 Moss-OpenAI Enterprise Proxy running on port ${PORT}`);
  Logger.info(`📡 Health check: http://localhost:${PORT}/health`);
  Logger.info(`🤖 Chat completions: http://localhost:${PORT}/v1/chat/completions`);
});

// ==========================================
// 7. 优雅停机与进程守护 (Graceful Shutdown & Guard)
// ==========================================

const gracefulShutdown = (signal) => {
  Logger.info(`${signal} signal received: closing HTTP server`);

  server.close(() => {
    Logger.info('HTTP server closed');
    // 如果有数据库连接，在这里关闭：await db.disconnect();
    process.exit(0);
  });

  // 如果10秒内没关掉，强制退出
  setTimeout(() => {
    Logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// 监听系统终止信号 (如 Ctrl+C 或 Docker stop)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 进程级异常捕获 (防止进程意外退出并记录完整堆栈)
process.on('uncaughtException', (error) => {
  Logger.error('UNCAUGHT EXCEPTION! 💥 System is crashing...', error);
  // 对于未捕获的致命异常，通常建议重启进程（由PM2或Docker负责重启）
  process.exit(1);
});

// 捕获未处理的 Promise Rejection (常见于异步操作忘记写catch)
process.on('unhandledRejection', (reason, _promise) => {
  Logger.error('UNHANDLED REJECTION! 💥', reason instanceof Error ? reason : new Error(String(reason)));
  // 这里通常不需要退出进程，但需要记录日志以便修复
});

module.exports = app;
