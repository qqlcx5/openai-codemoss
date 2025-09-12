# Moss OpenAI API 代理服务

这是一个Node.js代理服务器，用于将第三方moss接口转换为OpenAI格式的API，支持Cherry Studio等客户端调用。

## 功能特点

- ✅ 将moss API转换为标准OpenAI Chat Completions格式
- ✅ 支持Bearer Token身份验证
- ✅ 支持流式响应（stream）
- ✅ 兼容OpenAI API格式
- ✅ 支持Cherry Studio等客户端
- ✅ 完整的错误处理和日志

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `env.example` 为 `.env` 并根据需要修改：

```bash
cp env.example .env
```

### 3. 启动服务

```bash
# 生产环境
npm start

# 开发环境（自动重启）
npm run dev
```

服务将在 `http://localhost:3000` 启动。

## API 使用方法

### 聊天补全接口

**端点**: `POST /v1/chat/completions`

**请求头**:
```
Authorization: Bearer YOUR_MOSS_TOKEN
Content-Type: application/json
```

**请求体示例**:
```json
{
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "user",
      "content": "你好，请介绍一下自己"
    }
  ],
  "temperature": 0.7,
  "stream": false
}
```

**响应示例**:
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-4o-mini",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "你好！我是一个AI助手..."
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

### 流式响应

设置 `"stream": true` 可以启用流式响应：

```json
{
  "model": "gpt-4o-mini",
  "messages": [{"role": "user", "content": "写一首诗"}],
  "stream": true
}
```

### 其他端点

- `GET /health` - 健康检查
- `GET /v1/models` - 获取可用模型列表

## Cherry Studio 配置

在Cherry Studio中添加自定义API：

1. 打开Cherry Studio设置
2. 添加新的API提供商
3. 设置以下参数：
   - **API URL**: `http://localhost:3000/v1`
   - **API Key**: 你的moss token
   - **模型**: `gpt-4o-mini` 或 `gpt-4o`

## 技术实现

### 请求转换流程

1. **接收OpenAI格式请求** - 客户端发送标准OpenAI API请求
2. **Token验证** - 验证Authorization header中的Bearer token
3. **格式转换** - 将OpenAI格式转换为moss API格式
4. **调用moss API** - 使用提供的token调用moss接口
5. **响应转换** - 将moss响应转换回OpenAI格式
6. **返回结果** - 返回标准OpenAI格式响应

### 主要组件

- **认证中间件** - 处理Bearer token验证
- **格式转换器** - OpenAI ↔ moss格式转换
- **流处理器** - 处理流式响应
- **错误处理** - 统一错误响应格式

## 注意事项

1. 确保moss token有效且有足够的配额
2. 服务器需要能够访问 `jiangsu.codemoss.vip`
3. 建议在生产环境中使用HTTPS
4. 可以通过环境变量调整CORS设置

## 故障排除

### 常见问题

1. **401 Unauthorized** - 检查token是否正确设置
2. **500 Server Error** - 检查moss API是否可访问
3. **CORS错误** - 检查CORS配置

### 调试

启用详细日志：
```bash
LOG_LEVEL=debug npm start
```
--name moss-proxy：给进程起个名字，方便管理。
--watch：监听文件变化，开发时改完代码会自动重启。
--ignore-watch="node_modules"：忽略 node_modules 目录，避免无谓重启。

pm2 list          # 查看运行状态
pm2 logs moss-proxy # 实时日志
pm2 restart moss-proxy
pm2 stop moss-proxy
pm2 delete moss-proxy

## 许可证

MIT License