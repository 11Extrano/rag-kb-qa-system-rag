# OpenAI 库学习文档

本文用通俗语言说明：项目里用的 `openai` 这个 npm 包是什么、怎么用，以及**为什么用同一套代码就能连千问（通义）**。

---

## 一、这个库到底是啥？

- **包名**：`openai`（npm 上的官方 Node.js SDK）
- **作用**：用代码去调「大模型 / 向量模型」的 **HTTP 接口**，帮你发请求、解析返回。
- **重要一点**：虽然叫 OpenAI，但它**不只能连 OpenAI 一家**。只要对方提供的接口「长得和 OpenAI 一样」（路径、请求体、返回体一致），用这个库改个地址就能连。

可以把它想成：**一个按“标准菜单”点菜的客户端**——谁家厨房按这个菜单做菜，我就去谁家吃。

---

## 二、为什么可以连接千问？

因为**接口格式是统一的**。

1. **OpenAI 先定了一套 API 规范**  
   例如：  
   - 对话：`POST /v1/chat/completions`，body 里是 `{ model, messages, max_tokens, ... }`  
   - 向量：`POST /v1/embeddings`，body 里是 `{ model, input }`  
   返回的 JSON 结构也约定好了。

2. **很多厂商做了「兼容层」**  
   - **阿里云 DashScope（通义/千问）**：提供了「兼容模式」入口，例如  
     `https://dashscope.aliyuncs.com/compatible-mode/v1`  
     按 OpenAI 的路径和格式收请求，内部再转成自己的千问模型。  
   - **Ollama**：本地跑模型时，也暴露 `/v1/chat/completions`、`/v1/embeddings`，和 OpenAI 同款。  
   - 其他如 Azure、部分开源部署，也常有「OpenAI 兼容」选项。

3. **我们代码里只做两件事**  
   - 把「请求发到谁」改成：**baseURL**（例如 DashScope 的兼容地址）  
   - 把「用哪个模型」改成：**model**（例如 `qwen-plus`、`qwen-max`）  

所以：**用 OpenAI 这个库 + 千问的兼容地址 + 千问的模型名 = 就能连千问**，不需要换库，也不用为千问单独写一套请求逻辑。

---

## 三、我们项目里怎么用的？

用的是 **OpenAI SDK 的「自定义 baseURL」**：不连 OpenAI 官网，而是连你配置的地址（如阿里云兼容模式）。

### 3.1 创建客户端（关键：baseURL）

```ts
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',  // 千问兼容入口
  apiKey: 'sk-xxx',   // 你的 DashScope Key
  timeout: 60_000,
  maxRetries: 2,
});
```

- **baseURL**：请求发到这个根地址；SDK 会在后面自动拼 `/v1/chat/completions`、`/v1/embeddings` 等。
- **apiKey**：走兼容模式时，一般用 DashScope 的 Key，放在请求头里，服务端据此鉴权、计费。
- 不写 `baseURL` 时，默认就是 `https://api.openai.com`，即 OpenAI 官网。

也就是说：**同一套 `openai` 库，换 baseURL 就换了“哪家服务”**；千问能连上，是因为阿里云提供了和 OpenAI 同格式的兼容入口。

---

## 四、本项目用到的两类接口

### 4.1 文本向量化（Embeddings）——用于检索

**作用**：把一段文字变成一串数字（向量），用来做相似度检索。

```ts
const response = await client.embeddings.create({
  model: 'text-embedding-v3',   // 或 nomic-embed-text 等
  input: '用户的问题或文档片段',  // 可以是 string 或 string[]
});
// 取第一条的向量
const vector = response.data[0].embedding;  // number[]
```

- **model**：用哪个向量模型（我们项目里可由 `.env` 配成 DashScope 的 `text-embedding-v3` 等）。
- **input**：单句用字符串，多句用字符串数组，一次可算多条，减少请求次数。

**项目中的位置**：`server/app/service/embeddingProvider.ts`，供检索前「问题向量化」和建库时「文档块向量化」使用。

---

### 4.2 对话补全（Chat Completions）——用于生成答案

**作用**：根据「系统提示 + 用户内容」让大模型生成一段回复（我们用来根据检索结果生成答案）。

```ts
const response = await client.chat.completions.create({
  model: 'qwen-plus',           // 千问模型名
  messages: [
    { role: 'system', content: '你是知识库助手，只根据参考内容回答。' },
    { role: 'user', content: '【参考内容】...\n\n【用户问题】...' },
  ],
  max_tokens: 2048,
  temperature: 0.3,
});
const answer = response.choices[0]?.message?.content;
```

- **model**：选哪个模型（如 `qwen-plus`、`qwen-max`），由提供 baseURL 的那家决定有哪些可选。
- **messages**：多轮对话列表，`system` 定人设和规则，`user` 是当前这轮输入。
- **max_tokens**：回复最多生成多少 token，避免过长。
- **temperature**：控制随机性，0.3 偏稳定，适合知识库问答。

**项目中的位置**：`server/app/service/llmProvider.ts`，被 `answerGeneration` 调用来生成最终答案。

---

## 五、配置从哪里来（为啥能切到千问）

项目里 **baseURL、apiKey、model** 都来自配置，不写死在代码里：

- **配置文件**：`server/config/config.default.ts` 里读 `process.env`（例如 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`）。
- **环境变量**：根目录 `.env` 里配置，例如：
  - `LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`
  - `LLM_API_KEY=sk-xxx`
  - `LLM_MODEL=qwen-plus`

所以：**同一套代码，只要改 .env 里的 baseURL 和 model，就能从 OpenAI 换成千问，或从千问换成 Ollama 等**，这就是「OpenAI 兼容」的用处。

---

## 六、小结

| 问题 | 简短回答 |
|------|----------|
| openai 库是啥？ | 官方 Node SDK，用来调「大模型/向量」的 HTTP 接口。 |
| 为啥能连千问？ | 千问（DashScope）提供「OpenAI 兼容」入口，路径和请求/返回格式一致，用 baseURL 指过去即可。 |
| 我们怎么用？ | 用 `new OpenAI({ baseURL, apiKey })` 指向兼容地址，用 `embeddings.create` 做向量、`chat.completions.create` 做对话。 |
| 换模型/换厂商？ | 改配置里的 baseURL 和 model 即可，不必改业务代码。 |

如果你之后要接别的「OpenAI 兼容」服务（例如别的云或自建），只要对方文档里写兼容 OpenAI API，就同样用这个库 + 换 baseURL/model 即可。
