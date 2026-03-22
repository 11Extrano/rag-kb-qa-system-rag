## Why

当前问答链路按「单轮」设计：检索仅对用户当前句做 embedding，生成答案的 prompt 也不包含历史。用户短句追问与指代（如「海外呢？」）时检索易偏，且无法延续同一会话。需要在不做账号体系的前提下，用 **会话 id** 持久化多轮消息，并在检索侧采用 **改写再 embedding（方案 C）**、在作答侧纳入历史与 **token 预算/裁剪**，与 `docs/多轮知识库对话-上下文设计说明.md` 对齐。

## What Changes

- 引入 **会话与消息** 持久化（如 MySQL），用 `conversationId` 隔离不同对话；新话题使用新会话 id。
- **检索**前增加 **改写** 步骤（独立 LLM 请求/prompt）：输入含最近若干轮 user/assistant + 本轮用户消息，输出**仅用于检索**的一句独立问句；再对该句 **embed → top-k**；与最终「作答」LLM 调用分离，可共用同一 `LlmProvider`。
- **生成答案**时 prompt 包含经裁剪的多轮历史 + 本轮参考内容 + 用户问题；对整段输入做 **token 预算**，超限时按约定顺序裁剪（先 RAG 条 score 最低、再历史成对、再本轮 user、最后 system 非关键句）。
- **问答 API（含流式）** 支持携带 `conversationId`（及必要时的会话创建语义），流式与一次性行为在「多轮 + 改写 + 作答」链路上保持一致。

## Capabilities

### New Capabilities

- `conversation-context`: 会话与消息的持久化、按 `conversationId` 查询有序消息、与「不区分用户、仅会话隔离」相关的约束。

### Modified Capabilities

- `retrieval-match`: 检索输入从「仅用户字符串」扩展为「多轮场景下先改写再对改写结果做向量检索」；保留空查询拒绝等行为。
- `answer-generation`: 生成答案时须纳入多轮历史（经裁剪），并满足 token 预算与裁剪顺序；流式与一次性路径一致。
- `qa-stream`: 在现有一次性/流式问答接口上，请求体须能携带会话标识，使流式路径执行与同一会话一致的多轮链路。

## Impact

- **后端**：Egg 模型/迁移（会话表、消息表）、新或扩展 Service（改写、`qa` 控制器编排）、`retrievalMatch` / `answerGeneration` / `llmProvider` 调用序列变更；可能增加配置项（历史轮数上限、token 上限、改写 system prompt）。
- **前端**：请求体带 `conversationId`；提供「新会话」（换新 id + 清空当前页）。**不包含**多会话列表、多套聊天历史并行展示。
- **依赖**：无强制新基础设施；LLM 与 Embedding 调用次数增加（每轮多一次改写）。
