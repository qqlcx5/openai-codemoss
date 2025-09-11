fetch("http://104.223.65.179:8001/v1/chat/completions", {
  "headers": {
    "accept": "*/*",
    "accept-language": "zh-CN",
    "authorization": "Bearer AIzaSyD3Ldp3KwjBCVOi3t0jYfNzL1Y_WEUa_4A",
    "content-type": "application/json",
    "proxy-connection": "keep-alive"
  },
  "body": "{\"model\":\"gemini-2.5-flash\",\"temperature\":1,\"top_p\":1,\"extra_body\":{\"google\":{\"thinking_config\":{\"thinking_budget\":1228,\"include_thoughts\":true}}},\"messages\":[{\"role\":\"user\",\"content\":\"Cherry Studio\"}],\"stream\":true}",
  "method": "POST"
});