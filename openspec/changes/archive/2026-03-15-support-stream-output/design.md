## Context

- 当前问答流程：`POST /api/qa` 接收 `question`，检索 → 调用 LlmProvider.chat(messages) 一次性取回完整 answer → 返回 `{ answer, citations }`。前端 `askQuestion()` 请求该接口后一次性展示结果。
- LlmProvider 使用 OpenAI SDK 的 `chat.completions.create`，未使用 `stream`。OpenAI 兼容接口（含千问 DashScope）均支持 `stream: true`，返回 AsyncIterable 的 delta 内容。
- 需求：在不大改现有接口的前提下，增加流式输出路径，使答案可逐段推送到前端，实现打字机效果。

## Goals / Non-Goals

**Goals:**

- 提供流式问答接口，答案以增量方式推送到客户端，首字延迟显著低于一次性返回。
- **前端默认使用流式**：提交问题时默认传 `stream: true`，走 SSE 流式展示；保留一次性接口（不传或 `stream: false`）以备特殊场景。
- 保持与现有一次性接口并存，不破坏已有调用方。

**Non-Goals:**

- 检索阶段不做流式化；流式仅针对「答案生成」段。
- 不在此 change 中做多轮对话历史、会话管理。
- 不强制所有客户端改用流式（保留一次性接口）。

## Decisions

### 1. 流式传输协议：SSE（Server-Sent Events）

- **选择**：流式响应**前后端统一按 SSE 格式**：服务端按 SSE 规范写出（`Content-Type: text/event-stream`，`event:` / `data:` / 空行分隔），前端用 fetch 读流后按同一 SSE 格式解析。
- **理由**：单向、简单，服务端写流友好；事件类型清晰（chunk / citations / done），前后端约定一致，便于实现与排查。
- **备选**：纯 chunked JSON 行（NDJSON）——实现简单，但前端需自己解析行与区分类型；SSE 的 event 类型更清晰，便于扩展（如 `chunk` / `citations` / `done`）。

### 2. 接口形态：原有接口加请求参数

- **选择**：不新增路由，在现有 `POST /api/qa` 上通过请求体参数 `stream: true` 启用流式；请求体为 `{ question, stream?: boolean }`。当 `stream === true` 时响应为 SSE 流，否则为原有 JSON `{ success, data: { question, answer, citations } }`。
- **理由**：接口统一、仅一个入口，便于文档与前端调用；客户端显式传 `stream: true` 即得 SSE，不传或为 false 则保持兼容。
- **备选**：独立路由 `POST /api/qa/stream`——多一个 URL，部署/网关需区分；当前选择更简洁。

### 3. LlmProvider：新增流式方法

- **选择**：在 LlmProvider 中新增 `chatStream(messages): AsyncIterable<string>`（或返回 Node Readable/AsyncIterable），内部调用 `client.chat.completions.create({ ... params, stream: true })`，yield 每个 delta 的 content。
- **理由**：保持 `chat()` 一次性接口不变；流式逻辑集中在一处，便于复用和测试。
- **备选**：在现有 `chat()` 上增加可选参数 `stream: boolean` 并返回联合类型——会令返回值类型复杂，调用方分支多，故不采用。

### 4. 答案生成服务与控制器

- **选择**：AnswerGeneration 新增 `generateAnswerStream(question, matchedContents)`，返回 AsyncIterable（或类似）逐段产出文本；无匹配时先 yield 一段友好提示再结束。控制器 `qa.ask` 中：若 `stream === true`，检索 → 调用 `generateAnswerStream`，设置 SSE 头，遍历迭代器写 SSE 事件（chunk / citations / done）；否则走现有一次性逻辑返回 JSON。
- **理由**：检索逻辑与现有一致；流式只发生在「生成+写出」段，职责清晰；同一入口内分支清晰。
- **备选**：控制器直接调 LlmProvider.chatStream 并写流——会把 prompt 组装、无匹配处理等写在 controller，违反分层，故不采用。

### 5. 前端消费方式

- **选择**：使用 **fetch + 读流**：`fetch('/api/qa', { method: 'POST', body: JSON.stringify({ question, stream: true }) })`，根据 `Content-Type: text/event-stream` 读取 `response.body`（ReadableStream），按 SSE 格式解析（按行、按 event 类型），更新 React state 逐段追加 answer，收到 citations/done 后展示引用并结束。
- **理由**：接口为 POST 且需传 body，EventSource 仅支持 GET，故采用 fetch 流式读 body；解析逻辑封装在 api 层即可。

### 6. SSE 事件格式约定（前后端统一遵守）

- **chunk**：`event: chunk`，`data: <文本片段>`（可 base64 或 UTF-8，若含换行用 base64 更稳妥）。
- **citations**：`event: citations`，`data: <JSON 数组>`，与现有 citations 结构一致。
- **done**：`event: done`，可选 `data: {}`，表示流结束。
- **error**：`event: error`，`data: <错误信息>`。流式路径下发生错误时**必须先发送此事件再关闭连接**，前端据此展示错误并结束加载；不采用直接 4xx/5xx 断连，以便前端统一按 SSE 解析。

## Risks / Trade-offs

- **[流中断]** 网络或服务端异常导致流提前关闭 → 前端需处理 incomplete 状态，展示已收到内容并提示「回答可能不完整」；后端尽量在写流前完成检索与参数校验，减少中途失败。
- **[引用延迟]** 引用仅在流结束后发送 → 可接受，与「打字机效果」目标一致；若未来需要边流边标注来源，可再扩展 event 类型。
- **[长连接与超时]** 流式连接保持时间较长 → 配置合理的 keep-alive 与服务器/网关超时；Egg 默认超时可按需调整。
- **[兼容性]** 旧客户端不传 `stream` 或传 `stream: false` → 行为与现在完全一致，现有 `/api/qa` 契约不变。

## Migration Plan

1. 后端：实现 LlmProvider.chatStream、AnswerGeneration.generateAnswerStream，在 qa.ask 中根据 body.stream 分支写 SSE 或 JSON，本地/联调验证。
2. 前端：新增流式 API（传 `stream: true` 并解析 SSE）与 QaPage 流式模式（可选开关或默认流式），验证展示与引用。
3. 部署：先上线后端（同一接口支持 stream 参数），再上线前端流式能力；若有问题可先让前端不传 stream，后端行为不变。
4. 回滚：前端不再传 `stream: true` 即可回到一次性 JSON；后端保留分支不影响未传 stream 的请求。

## Open Questions

- （已定）前端默认使用流式；错误时先发送 `event: error` 再关闭连接。
