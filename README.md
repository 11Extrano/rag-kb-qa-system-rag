# RAG 知识库问答系统

基于企业自有文档的检索增强生成（RAG）系统：文档上传 → 清洗/拆分 → 向量化存储 → 检索匹配 → 答案生成。支持管理员管理文档、用户自然语言提问并获取带引用来源的答案。

- **Node**：22（见 `.nvmrc`）
- **前后端分离**：
  - **client/**：前端，React 18 + TypeScript + Rsbuild + Ant Design
  - **server/**：后端，Egg.js + TypeScript，MySQL，LanceDB

## 目录结构

```
├── client/          # 前端（待实现，见 tasks 7.x）
├── server/          # 后端（Egg.js）
├── openspec/        # OpenSpec 变更与规格
├── docker-compose.yml
├── .env.example
└── README.md
```

## 快速开始

1. **Node 22**
   ```bash
   nvm use 22   # 或按 .nvmrc
   ```

2. **MySQL（本地开发）**
   ```bash
   docker-compose up -d
   ```
   复制 `.env.example` 为 `.env`，并设置 `MYSQL_PASSWORD=rag_kb_dev`（与 docker-compose 一致）。

3. **LanceDB（向量库）**
   - **无需单独安装或启动**：使用嵌入式 LanceDB，数据存到本地目录。
   - 默认目录：`server/.lancedb-data`（相对 server 进程 cwd）。可在 `.env` 中设置 `LANCEDB_PATH` 覆盖。
   - 首次上传文档并完成“拆分 + 向量化”后会自动建表并写入向量。

4. **大模型与嵌入（必配）**
   - 默认使用 **Ollama**（`http://localhost:11434/v1`），模型：对话 `qwen2.5`、向量 `nomic-embed-text`。
   - 若用 Ollama：安装并启动 Ollama 后执行：
     ```bash
     ollama pull qwen2.5
     ollama pull nomic-embed-text
     ```
   - 若用其他 OpenAI 兼容接口（如 OpenAI、通义等）：在 `.env` 中设置 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL` 以及 `EMBEDDING_BASE_URL`、`EMBEDDING_API_KEY`、`EMBEDDING_MODEL`（见 `.env.example`）。

5. **后端**
   ```bash
   cd server && npm install && npm run dev
   ```
   接口默认：http://127.0.0.1:7001

6. **前端**
   ```bash
   cd client && npm install && npm run dev
   ```

根目录脚本：`npm run dev:server` / `npm run dev:client` 分别进入 server、client 开发。

**常见问题**：问答报错或返回“答案生成服务暂时不可用”，多为 LLM 未配置或不可达。请确认 Ollama 已启动且已拉取上述模型，或已在 `.env` 中正确配置其它 API。

## API

- 管理员：`POST/GET/DELETE /api/admin/documents`（上传、列表、删除）
- 用户：`POST /api/qa`，body `{ "question": "..." }`，返回 `answer` 与 `citations`

设计、规格与任务见 `openspec/changes/setup-rag-kb-qa-system/`。
