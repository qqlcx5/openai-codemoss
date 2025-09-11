1. 用 Node.js 搭建一个中间层服务，负责把 OpenAI 的请求参数转换成第三方 API 所需的格式，并把第三方返回的数据再封装回 OpenAI 的标准响应格式。

---
如果conversationId 存在，直接使用，不存在，调用新建接口
当 发送 1 或者 重置 指令时，重新调用新建接口

fetch("https://jiangsu.codemoss.vip/luomacode-api/conversation", {
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
  "body": "{\"title\":\"新建问题\",\"assistantId\":1,\"version\":\"2\"}",
  "method": "POST"
});
返回
{
  "msg": "5364828",
  "code": 0,
  "list": [
    {
      "id": "5364828",
      "username": "1013915",
      "status": 0,
      "title": "新建问题",
      "firstContent": null,
      "appId": 1,
      "size": 1,
      "createTime": 1757586841000,
      "updateTime": 1757586841000,
      "type": 0,
      "collect": 0
    }
  ]
}
取id 在 completions 接口上使用


当 model后缀有加-tmp, completions 接口的参数 assistantId 改成 2 否则 1

