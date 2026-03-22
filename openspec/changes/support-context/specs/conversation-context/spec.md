## Purpose

在不引入用户账号的前提下，用 **会话 id** 区分对话线，将会话元数据与 user/assistant 消息持久化，供**同一会话内**多轮检索改写与生成答案拉取历史。**本期不要求**多会话列表、客户端多套会话并行历史；换新 `conversationId` 即视为新话题，旧会话数据可留库但不通过本期 API/UI 枚举。

## ADDED Requirements

### Requirement: 系统持久化会话与消息

系统必须将会话与消息存储在服务端持久化存储（如 MySQL）中：会话须包含唯一标识（`conversationId`）及创建/更新时间等元数据；消息须归属某会话，包含 `role`（user 或 assistant）、`content`、以及用于排序的时间戳或序号。用户消息与助手消息均须支持持久化，以便多轮追问与改写输入可读取 assistant 原文。（MUST）

#### Scenario: 写入一轮问答后存在两条消息

- **WHEN** 一轮问答完成且系统已生成助手回复
- **THEN** 系统必须在该 `conversationId` 下持久化本轮 user 消息与 assistant 消息，且可按时间或序号顺序列出

#### Scenario: 按会话查询历史

- **WHEN** 请求携带有效的 `conversationId`
- **THEN** 系统必须返回该会话下有序的消息列表，且不混入其他 `conversationId` 的消息

---

### Requirement: 系统以会话 id 隔离对话线

系统必须保证不同 `conversationId` 之间的消息与检索/生成上下文互不混用；新话题须使用新的 `conversationId`（由客户端或服务端按约定生成）。系统不得将会话 A 的历史用于会话 B 的改写或作答。（MUST）

#### Scenario: 新会话无历史

- **WHEN** 请求使用一个全新的 `conversationId` 且该会话尚无消息
- **THEN** 系统必须按「无历史」路径处理改写与生成，不得读取其他会话消息

---

### Requirement: 系统不实现用户级账号隔离

本能力不要求用户注册、登录或用户 id 字段；隔离粒度仅为 **会话 id**。若未来引入用户体系，须另行变更 spec。（MUST）

#### Scenario: 无用户 id 亦可创建会话

- **WHEN** 客户端仅提交会话与消息所需字段而无用户身份
- **THEN** 系统仍须能创建会话并写入消息，行为符合上述持久化与会话隔离要求

---

### Requirement: 本期不提供会话枚举与多会话管理

系统 SHALL NOT 在本期提供「列出全部会话」或等价枚举接口供客户端构建会话列表；客户端多会话列表、多套聊天历史并行切换不在本期交付范围。按给定 `conversationId` 查询该会话下有序消息（供多轮编排）仍属必须。（MUST）

#### Scenario: 无会话列表端点

- **WHEN** 客户端需要上下文以继续**当前** `conversationId` 下的多轮对话
- **THEN** 系统须能按该 id 返回消息序列；系统不得在本期要求实现「返回用户所有 conversationId」的列表接口作为核心能力

#### Scenario: 新话题仅换 id

- **WHEN** 客户端使用新的 `conversationId` 发起首轮请求
- **THEN** 系统按无历史处理；**不得**将本期 spec 解读为必须展示或切换历史多个会话线程
