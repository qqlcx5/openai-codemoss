const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8002;

// 存储会话ID的内存存储（生产环境建议使用Redis或数据库）
const conversationStore = new Map();

// 中间件
app.use(cors());
app.use(express.json());

// 存储用户token的内存存储
const userTokenStore = new Map();

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
      return data.loginToken;
    } else {
      throw new Error('登录返回数据格式错误');
    }
  } catch (error) {
    console.error('登录时出错:', error);
    throw error;
  }
};

// Token验证中间件
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
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
        realToken = await loginAndGetToken();
        userTokenStore.set('default_user', realToken);
        console.log('已自动登录并获取新token');
      } catch (error) {
        return res.status(401).json({
          error: {
            message: '自动登录失败，请重试',
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
        title: '新建问题',
        assistantId: getVersionFromModel(model),
        version: '2'
      })
    });

    if (!response.ok) {
      throw new Error(`创建会话失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.code === 0 && data.list && data.list.length > 0) {
      return data.list[0].id;
    } else {
      throw new Error('创建会话返回数据格式错误');
    }
  } catch (error) {
    console.error('创建新会话时出错:', error);
    throw error;
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
  return content === '重置';
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


// OpenAI格式到moss格式的转换函数
const convertToMossFormat = (openaiRequest, mossToken, conversationId) => {
  const { messages, model, temperature, max_tokens, stream } = openaiRequest;

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

// 主要的代理端点
app.post('/v1/chat/completions', authenticateToken, async (req, res) => {
  try {
    const { stream, messages } = req.body;
    const userKey = req.mossToken; // 使用token作为用户标识

    // 检查是否需要重新登录
    if (shouldRelogin(messages) && req.mossToken === 'sk-qqlcx5') {
      try {
        const newToken = await loginAndGetToken();
        userTokenStore.set('default_user', newToken);
        req.mossToken = newToken; // 更新当前请求的token
        let errorMessage = `账号过期，已重新登录成功，请重新提问~~`;
        const streamChunk = convertToOpenAIStream(errorMessage, req.body.model);
        res.write(`data: ${JSON.stringify(streamChunk)}\n\n`);
        res.end();
        return;

      } catch (error) {
        console.error('重新登录失败:', error);
        return res.status(500).json({
          error: {
            message: '重新登录失败，请稍后重试',
            type: 'authentication_error',
            code: 'relogin_failed'
          }
        });
      }
    }

    let conversationId = conversationStore.get(userKey);

    // 检查是否需要重置会话或创建新会话
    if (!conversationId || shouldResetConversation(messages)) {
      try {
        const newConversationId = await createNewConversation(req.mossToken, req.body.model);
        conversationStore.set(userKey, newConversationId);
        let errorMessage = `会话ID已失效，新的会话 ID: ${newConversationId} 已创建 ，请重新提问~~`;
        const streamChunk = convertToOpenAIStream(errorMessage, req.body.model);
        res.write(`data: ${JSON.stringify(streamChunk)}\n\n`);
        res.end();
        return;
      } catch (error) {
        console.error('创建新会话失败:', error);
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
    console.log(`使用会话ID ${conversationId} 发送请求到 moss API...`);
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
        'Access-Control-Allow-Headers': 'Cache-Control'
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
                const streamChunk = convertToOpenAIStream(errorMessage, req.body.model);
                res.write(`data: ${JSON.stringify(streamChunk)}\n\n`);
                res.end();
                return;
              }
              const aggregatedContent = parsedChunk?.msgItem?.theContent || ''
              const streamChunk = convertToOpenAIStream(aggregatedContent, req.body.model);
              res.write(`data: ${JSON.stringify(streamChunk)}\n\n`);
            } catch (e) {
              console.error('Error processing stream chunk:', e);
            }
          }
        }
      });

      reader.on('end', () => {
        res.write('data: [DONE]\n\n');
        res.end();
      });

      reader.on('error', (error) => {
        console.error('Stream error:', error);
        res.end();
      });

    } else {
      // 非流式响应处理
      const mossData = await response.json();
      const openaiResponse = convertToOpenAIFormat(mossData, req.body.model);

      res.json(openaiResponse);
    }

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'server_error',
        code: 'proxy_error'
      }
    });
  }
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

app.listen(PORT, () => {
  console.log(`🚀 Moss-OpenAI proxy server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 Chat completions: http://localhost:${PORT}/v1/chat/completions`);
});

module.exports = app;
