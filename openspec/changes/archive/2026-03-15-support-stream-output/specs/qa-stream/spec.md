## Purpose

在现有问答接口上通过请求参数支持流式输出：客户端在请求体中传 `stream: true` 即可获得 SSE 流式响应，服务端逐段推送答案片段，流结束后推送引用；前端消费 SSE 并逐段展示答案（打字机效果），最后展示引用。

## Requirements

### Requirement: 系统在现有问答接口上通过请求参数支持流式输出

系统必须在现有问答接口（如 `POST /api/qa`）上支持可选请求参数（如请求体 `stream: true`）。当客户端传入该参数且为 true 时，响应必须为 **SSE** 流，逐段推送答案片段；未传或为 false 时，响应保持原有 JSON 一次性返回（`{ success, data: { question, answer, citations } }`）。流式路径下须先执行检索、再基于匹配结果流式调用 LLM 并写出；无匹配时须先输出友好提示再结束流。（MUST）

#### Scenario: 流式返回答案内容

- **WHEN** 客户端请求同一接口且请求体中 `stream === true`，且检索返回至少一个匹配片段
- **THEN** 系统必须以 SSE 方式逐段输出答案文本，且流结束前或结束时输出引用列表（与一次性响应的 citations 结构一致）

#### Scenario: 无匹配时的流式响应

- **WHEN** 客户端请求流式（`stream: true`）且检索返回空片段列表
- **THEN** 系统须在流中输出友好提示（如「当前知识库中暂无相关内容」），且不得调用 LLM 编造内容，然后结束流

#### Scenario: 不传 stream 或 stream 为 false 时保持原有行为

- **WHEN** 客户端调用 `POST /api/qa` 且未传 `stream` 或 `stream === false`
- **THEN** 系统行为与流式引入前一致，返回 JSON 形式的完整 answer 与 citations

---

### Requirement: 流式响应前后端统一按 SSE 格式

系统在流式路径下必须采用 **SSE** 作为唯一格式：服务端按 SSE 规范写出（`event:`、`data:`、空行分隔等），前端按同一 SSE 格式解析，区分「文本片段」「引用」「结束」等事件类型并更新 UI。（MUST）

#### Scenario: 文本片段事件

- **WHEN** 服务端向流中写入答案的下一段内容
- **THEN** 客户端必须能通过约定格式（如 `event: chunk`、`data: <文本>`）识别并拼接文本片段

#### Scenario: 引用与结束事件

- **WHEN** 答案生成完毕
- **THEN** 服务端必须发送引用数据（如 `event: citations`、`data: <JSON>`）及结束标记（如 `event: done`），客户端必须能据此展示引用并结束加载状态

#### Scenario: 错误事件

- **WHEN** 流式处理发生错误
- **THEN** 服务端发送 `event: error`、`data: <错误信息>` 后关闭连接，客户端必须能识别并展示错误、结束加载状态

---

### Requirement: 前端默认使用流式并逐段展示答案

前端必须**默认使用流式**（提交问题时默认传 `stream: true`），提供调用流式接口并读取流的能力；必须逐段将收到的答案文本追加到展示区域（打字机效果），在收到引用与结束事件后展示引用列表、结束加载状态；收到 `event: error` 时展示错误信息并结束加载。（MUST）

#### Scenario: 默认流式下逐段展示

- **WHEN** 用户提交问题（前端默认以流式请求，body 传 `stream: true`）
- **THEN** 前端必须在收到每个 SSE 文本片段后更新展示内容，使用户能尽早看到部分答案

#### Scenario: 流结束后展示引用

- **WHEN** 前端收到引用事件及结束事件
- **THEN** 前端必须展示引用列表（与一次性接口的 citations 展示方式一致或兼容），并标记流式回答完成

#### Scenario: 收到 error 事件时展示错误

- **WHEN** 前端在流式响应中收到 `event: error`（`data:` 为错误信息）
- **THEN** 前端必须展示该错误信息、结束加载状态，并视连接关闭为正常结束

---

### Requirement: 流式路径下错误时先发送 event: error 再关闭

在流式路径下，当发生错误（如参数校验失败、检索异常、生成过程异常）时，服务端必须**先发送** `event: error`（`data:` 为错误信息），**再关闭**连接；不得在未发送 error 事件的情况下直接以 4xx/5xx 或断连结束，以便前端统一按 SSE 解析并展示错误。（MUST）

#### Scenario: 错误时先发 error 再关闭

- **WHEN** 流式请求处理过程中发生任意错误
- **THEN** 服务端必须先写出 `event: error` 与 `data: <错误信息>`，再关闭连接；前端收到 error 后展示错误并结束加载
