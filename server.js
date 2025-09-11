const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8002;

// 中间件
app.use(cors());
app.use(express.json());

// Token验证中间件
const authenticateToken = (req, res, next) => {
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

  // 这里可以添加token验证逻辑
  // 目前直接将token传递给moss接口
  req.mossToken = token;
  next();
};

// OpenAI格式到moss格式的转换函数
const convertToMossFormat = (openaiRequest, mossToken) => {
  const { messages, model, temperature, max_tokens, stream } = openaiRequest;

  // 提取最后一条用户消息作为prompt
  const userMessages = messages.filter(msg => msg.role === 'user');
  const prompt = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '';

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
        nonce: "hp_35858860",
        conversationId: "5364327",
        // nonce: `hp_${Math.floor(Math.random() * 100000000)}`,
        // conversationId: Math.floor(Math.random() * 10000000).toString(),
        openaiVersion: model || 'gpt-4o-mini',
        datasetIds: [],
        voice: false,
        image: false,
        assistantId: 2,
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
    const { stream } = req.body;
    const mossRequest = convertToMossFormat(req.body, req.mossToken);

    console.log('Proxying request to moss API...');

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
