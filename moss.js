fetch("https://jiangsu.codemoss.vip/luomacode-api/v3/moss/completions", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9",
    "cache-control": "no-cache",
    "content-type": "application/json",
    "pragma": "no-cache",
    "priority": "u=1, i",
    "sec-ch-ua": "\"Chromium\";v=\"140\", \"Not=A?Brand\";v=\"24\", \"Google Chrome\";v=\"140\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    "token": "eyJ0eXAiOiJqd3QiLCJhbGciOiJIUzUxMiJ9.eyJ1aWQiOiIxMDEzOTE1IiwiaWRlbnRpdHlJZCI6IjEwNTAwMDEiLCJjcmVhdGVkIjoxNzU2MTE3MzQ1MjE4LCJleHAiOjE3NjM4OTMzNDV9.9SE6UDg50-C5dIwzWrA-ajSYCgD57ybQSmubhXVXAQCWGY2-8a9OkaF_dINN6QHpPzEH-1hoip3KeoL2SgMEOQ"
  },
  "body": "{\"prompt\":\"有一个接口，我希望通过node 中转然后输出openAI格式\",\"options\":{\"openCot\":false,\"appId\":null,\"nonce\":\"hp_35858860\",\"conversationId\":\"5364327\",\"openaiVersion\":\"gpt-4o-mini\",\"datasetIds\":[],\"voice\":false,\"image\":false,\"assistantId\":2,\"version\":\"2\"},\"apiKey\":null}",
  "method": "POST"
});

// response
```json
{"code":"ChatMossChatContentEvent","conversationId":"5364381","nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"","role":"assistant"},"index":0}],"theContent":""},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"你好"},"index":0}],"theContent":"你好"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"！"},"index":0}],"theContent":"！"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"很"},"index":0}],"theContent":"很"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"高"},"index":0}],"theContent":"高"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"兴"},"index":0}],"theContent":"兴"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"为"},"index":0}],"theContent":"为"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"你"},"index":0}],"theContent":"你"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"服务"},"index":0}],"theContent":"服务"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"，有"},"index":0}],"theContent":"，有"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"什么"},"index":0}],"theContent":"什么"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"问题"},"index":0}],"theContent":"问题"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"或者"},"index":0}],"theContent":"或者"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"需求"},"index":0}],"theContent":"需求"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"可以"},"index":0}],"theContent":"可以"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"告诉"},"index":0}],"theContent":"告诉"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"我"},"index":0}],"theContent":"我"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"，我"},"index":0}],"theContent":"，我"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"会"},"index":0}],"theContent":"会"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"尽"},"index":0}],"theContent":"尽"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"力"},"index":0}],"theContent":"力"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"帮"},"index":0}],"theContent":"帮"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"你"},"index":0}],"theContent":"你"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"解决"},"index":0}],"theContent":"解决"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgItem":{"choices":[{"delta":{"content":"。"},"index":0}],"theContent":"。"},"nonce":"hp_569908753","status":1,"uid":"1013915"}
{"aiTimeMillis":1376,"code":"ChatMossChatTimeEvent","conversationId":"5364381","nonce":"hp_569908753","searchDatasetTimeMillis":0,"uid":"1013915"}
{"code":"ChatMossChatConsumeEvent","conversationId":"5364381","mossReduceInfo":{"answerReduce":0,"askReduce":-1,"contentReduce":0,"genImgReduce":0,"guessAskReduce":0,"mossReduceInfoStr":"-1_0_0_gpt-4o-mini:0:0:0:0:0","openaiVersion":"gpt-4o-mini","questionMode":"GPT4.1-mini","searchResultsReduce":0,"totalParseImageReduce":0,"totalReduce":-1,"usePluginReduce":0,"viewMsg":"合计消耗1次"},"nonce":"hp_569908753","uid":"1013915"}
{"code":"ChatMossChatContentEvent","conversationId":"5364381","msgId":"563937","nonce":"hp_569908753","status":2,"uid":"1013915"}
```
