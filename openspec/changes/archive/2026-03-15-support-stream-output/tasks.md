## 1. 后端 - LlmProvider 流式支持

- [x] 1.1 在 llmProvider 中新增 chatStream(messages)，调用 chat.completions.create(..., stream: true)，返回 AsyncIterable<string> 逐段 yield content delta
- [x] 1.2 为 chatStream 补充错误处理与空 content 处理，保持与现有 chat() 相同的配置（model、max_tokens、temperature）

## 2. 后端 - 答案生成流式能力

- [x] 2.1 在 answerGeneration 中新增 generateAnswerStream(question, matchedContents)，无匹配时 yield 友好提示后结束；有匹配时组装 prompt 并调用 llmProvider.chatStream，逐段 yield 文本
- [x] 2.2 generateAnswerStream 在流结束后能提供 citations 列表（与现有 generateAnswer 的 citations 结构一致），供控制器在流末尾发送

## 3. 后端 - 现有 QA 接口按参数分支 SSE

- [x] 3.1 在 qa 控制器 ask 方法中读取请求体 stream 参数；若 stream === true，校验 question 后执行检索、调用 generateAnswerStream，设置 SSE 响应头（Content-Type: text/event-stream 等）
- [x] 3.2 流式分支：遍历 generateAnswerStream 迭代器，按约定写 event: chunk / data: <文本>；流结束后写 event: citations / data: <JSON> 与 event: done；发生错误时先写 event: error / data: <错误信息> 再关闭连接；非流式分支保持现有 JSON 返回逻辑
- [x] 3.3 确保路由仍为 POST /api/qa，不新增路由

## 4. 前端 - 流式 API 与解析

- [x] 4.1 新增 askQuestionStream(question) 或等价方法：fetch POST /api/qa，body 传 { question, stream: true }，根据 Content-Type 或响应处理 SSE，读取 response.body 并按约定解析 event 类型（chunk / citations / done）
- [x] 4.2 将解析结果通过回调或 AsyncIterable 暴露：onChunk(text)、onCitations(citations)、onDone()、onError(message)，便于 QaPage 订阅；解析时识别 event: error 并触发 onError

## 5. 前端 - 问答页流式展示

- [x] 5.1 在 QaPage 中默认使用流式：提交时默认调用流式 API（stream: true），用 state 累积 answer 片段并实时更新展示（打字机效果）
- [x] 5.2 在收到 citations 与 done 后展示引用列表、结束 loading；收到 event: error 时展示错误信息并结束 loading，处理流中断与异常
