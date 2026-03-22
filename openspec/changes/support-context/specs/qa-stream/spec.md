## MODIFIED Requirements

### Requirement: 系统在现有问答接口上通过请求参数支持流式输出

系统必须在现有问答接口（如 `POST /api/qa`）上支持可选请求参数（如请求体 `stream: true`）。请求体须支持携带 **conversationId**（或实现约定的会话标识），以便与同一会话的多轮改写、检索与生成链路一致；未携带时可按单轮或无历史路径处理（与 `answer-generation` / `retrieval-match` delta 一致）。当客户端传入 `stream` 且为 true 时，响应必须为 **SSE** 流，逐段推送答案片段；未传或为 false 时，响应保持原有 JSON 一次性返回（`{ success, data: { question, answer, citations } }` 或兼容扩展字段）。流式路径下须先执行会话加载、检索前改写（若有历史）、检索、再基于匹配结果流式调用 LLM 并写出；无匹配时须先输出友好提示再结束流。（MUST）

#### Scenario: 流式返回答案内容

- **WHEN** 客户端请求同一接口且请求体中 `stream === true`，且检索返回至少一个匹配片段
- **THEN** 系统必须以 SSE 方式逐段输出答案文本，且流结束前或结束时输出引用列表（与一次性响应的 citations 结构一致）

#### Scenario: 无匹配时的流式响应

- **WHEN** 客户端请求流式（`stream: true`）且检索返回空片段列表
- **THEN** 系统须在流中输出友好提示（如「当前知识库中暂无相关内容」），且不得调用 LLM 编造内容，然后结束流

#### Scenario: 不传 stream 或 stream 为 false 时保持原有行为

- **WHEN** 客户端调用 `POST /api/qa` 且未传 `stream` 或 `stream === false`
- **THEN** 系统行为与仅流式参数语义一致：返回 JSON 形式的完整 answer 与 citations；若携带 `conversationId` 则须执行多轮链路但仍为 JSON 响应

#### Scenario: 多轮会话下流式与一次性共用同一编排

- **WHEN** 请求携带 `conversationId` 与 `stream: true`
- **THEN** 系统必须与携带相同 `conversationId` 且 `stream: false` 时在改写、检索与 prompt 组装规则上一致，仅响应形式（SSE vs JSON）不同
