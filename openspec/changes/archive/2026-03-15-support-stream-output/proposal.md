## Why

当前问答接口一次性返回完整答案，长答案时用户需长时间等待且无中间反馈，体验较差。支持流式输出可让首字更快呈现、答案以打字机效果逐字/逐段展示，减少白屏等待并提升感知性能。

## What Changes

- 在**现有问答接口**上通过请求参数支持流式：`POST /api/qa` 请求体增加可选参数 `stream: true`；当 `stream === true` 时以 **SSE** 方式逐段返回答案片段，否则保持原有 JSON 一次性返回。
- **流式响应前后端统一按 SSE 格式**：服务端按 SSE 规范写出（`event:`、`data:`、空行分隔等），前端用 fetch 读流后按同一 SSE 格式解析。
- 后端：LlmProvider 支持流式调用 LLM（`stream: true`），答案生成服务支持流式返回；在现有 QA 控制器同一接口内根据 `stream` 参数分支，写出 SSE 或 JSON。
- 前端：**默认使用流式**（提交问题时默认传 `stream: true`），使用 **fetch + 读流** 消费流式响应并按 SSE 格式解析，问答页逐字/逐段追加展示答案，流结束后展示引用；仍保留一次性接口供特殊场景。
- 错误时：流式路径下服务端先发送 **`event: error`**（`data:` 为错误信息），再关闭连接，便于前端统一解析并提示。
- 保留现有一次性接口行为，不破坏已有调用方。

## Capabilities

### New Capabilities

- `qa-stream`: 流式问答的 API 契约（请求/响应格式统一为 **SSE**）与前端消费流、按 SSE 解析并逐段展示答案与最终引用的能力。

### Modified Capabilities

- `answer-generation`: 在现有「一次性返回答案+引用」基础上，支持「流式生成并返回答案」的可选行为（LlmProvider 支持流式调用、答案生成可流式写出；引用仍在流结束后随元数据返回）。

## Impact

- **后端**：`server/app/service/llmProvider.ts`（新增流式 chat 方法）、`server/app/service/answerGeneration.ts`（支持流式生成/写出）、`server/app/controller/qa.ts`（在现有 ask 中根据 body.stream 分支，写 SSE 或 JSON）；路由不变，仍为 `POST /api/qa`。
- **前端**：`client/src/api/`（流式请求与解析）、`client/src/pages/QaPage.tsx`（流式模式下的状态与 UI 更新）。
- **依赖**：OpenAI SDK 已支持 `stream: true`，无需新增依赖；若采用 SSE，需约定事件格式与编码。
