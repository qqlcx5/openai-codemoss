const response = await fetch("http://66.154.117.189:8002/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk-qqlcx5"
  },
  body: JSON.stringify({
    model: "gpt-4o-mini-tmp",
    messages: [
      { role: "user", content: "请求发生错误: 客户端 API Key 无效" }
    ],
    stream: true
  })
});

// 1. 获取流的读取器
const reader = response.body.getReader();
// 2. 创建文本解码器 (将 Uint8Array 转为字符串)
const decoder = new TextDecoder("utf-8");

console.log("开始接收流...");

while (true) {
  // 3. 逐块读取数据
  const { done, value } = await reader.read();
  if (done) {
    console.log("\n\n--- 接收完毕 ---");
    break;
  }

  // 4. 解码当前块
  const chunk = decoder.decode(value, { stream: true });

  // 5. 解析 SSE (Server-Sent Events) 格式数据
  // 流数据通常是以 "data: {...}\n\n" 的形式过来的
  const lines = chunk.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const dataStr = line.replace('data: ', '').trim();
      if (dataStr === '[DONE]') continue; // 结束标志

      try {
        const parsed = JSON.parse(dataStr);
        const content = parsed.choices[0]?.delta?.content || "";
        process.stdout.write(content); // 在控制台实现打字机输出
      } catch (e) {
        // 忽略由于网络分块导致的不完整 JSON 解析错误
      }
    }
  }
}
