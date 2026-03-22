## 1. 数据模型与迁移

- [ ] 1.1 设计并新增会话表、消息表（含 `conversation_id`、`role`、`content`、排序字段），编写 Egg Sequelize 迁移或同步脚本
- [ ] 1.2 在 `app/model` 中注册模型并验证与现有 MySQL 连接一致

## 2. 检索前改写与检索编排

- [ ] 2.1 新增改写服务（如 `queryRewrite`）：输入最近 N 轮消息 + 本轮用户句，调用 `llmProvider` 独立 prompt，输出单句检索 query；失败时按 design 兜底（如回退用户原文）
- [ ] 2.2 调整 `retrievalMatch`（或上层编排）：先改写再对改写结果 `embed` + `search`，保持 `MatchedContent` 结构与 score 降序
- [ ] 2.3 为改写与检索增加可配置项（历史轮数上限、超时/重试策略如需）

## 3. 生成答案与 token 裁剪

- [ ] 3.1 扩展 `answerGeneration`：组装 messages 时并入裁剪后的多轮历史；本轮参考与用户问题格式与现有约束一致
- [ ] 3.2 实现 token 计数与裁剪顺序（RAG 最低 score → 历史成对 → 本轮 user → system），配置预算与余量
- [ ] 3.3 流式与一次性共用同一组装逻辑，满足 `answer-generation` delta

## 4. API 与会话编排

- [ ] 4.1 扩展 `POST /api/qa`（及流式路径）请求体：支持 `conversationId`；无 id 时单轮兼容
- [ ] 4.2 在 `qa` 控制器中编排：读会话历史 → 改写 → 检索 → 裁剪 → 生成 → 持久化本轮 user/assistant
- [ ] 4.3 会话创建：客户端生成 `conversationId`（UUID），**首条问答请求**时服务端隐式 `INSERT` 会话（见 design「已决议」）
- [ ] 4.4 实现按 `conversationId` 只读拉取消息（供服务端编排与**可选**整页刷新恢复**当前**会话）；**不做**枚举全部会话的 API

## 5. 前端

- [ ] 5.1 客户端维护**当前** `conversationId`（如 localStorage 仅存一个），提问时随请求体发送；「新会话」换新 id 并清空界面，**不**做会话列表与多路历史
- [ ] 5.2 （可选）整页刷新后仅恢复**当前** id 对应消息；非必须、且不扩展为多会话列表

## 6. 验证

- [ ] 6.1 手工或自动化用例：单轮无回归、多轮「海外呢？」类指代、空库无匹配、流式与 JSON 行为一致
- [ ] 6.2 对照 `openspec/changes/support-context/specs/**` 与 `docs/多轮知识库对话-上下文设计说明.md` 做验收勾选
