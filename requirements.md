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

---

token 值 sk-qqlcx5 忽略不取里面的值, 反之取
通过下面接口，登录账号获取token, 发送 重新登录 和 login 和 登录 调用下面接口，然后调用新建会话接口

curl 'https://jiangsu.codemoss.vip/luomacode-api/user/login' \
  -H 'accept: application/json, text/plain, */*' \
  -H 'accept-language: zh-CN,zh;q=0.9' \
  -H 'cache-control: no-cache' \
  -H 'content-type: application/json' \
  -H 'origin: https://pc.aihao123.cn' \
  -H 'pragma: no-cache' \
  -H 'priority: u=1, i' \
  -H 'sec-ch-ua: "Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "Windows"' \
  -H 'sec-fetch-dest: empty' \
  -H 'sec-fetch-mode: cors' \
  -H 'sec-fetch-site: cross-site' \
  -H 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' \
  --data-raw '{"email":"893917884@qq.com","password":"qqlcx5"}'
2. 修复发送 1 和重置，调用接口，输出，对话，但是要返回提示信息
3. completion 接口，报错 返回的信息，如下
{
  "code": -1,
  "status": 3,
  "msg": "该模型暂时下线，请稍后再试",
  "content": "该模型暂时下线，请稍后再试",
  "nonce": "hp_678727898",
  "conversationId": "5364868"
}
