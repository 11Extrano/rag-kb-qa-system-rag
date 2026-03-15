## Context

当前 EmbeddingProvider.embedBatch 将调用方传入的全部 texts 一次性发给 embedding API。阿里云 DashScope 等接口限制单次 `input` 条数不超过 10，导致文档拆分后 chunk 数大于 10 时上传报错。需在保持 embedBatch 对外签名与语义不变的前提下，在内部满足上游 batch 限制。

## Goals / Non-Goals

**Goals:**

- 使批量向量化在任意 chunk 数量下均不触发上游「batch size invalid」类错误。
- 对外接口不变：embedBatch(texts: string[]) 仍接受任意长度数组，返回与 texts 一一对应的 embedding 数组；调用方（如 VectorStoreService.indexChunks）无需改动。

**Non-Goals:**

- 不在本变更内做 batch 大小的运行时配置（可后续在 config.rag.embedding 增加可选配置）。
- 不改变单条 embed、LanceDB 写入、检索等其它行为。

## Decisions

1. **在 EmbeddingProvider 内部分批**
   - 在 embedBatch 内按固定大小（如 10）将 texts 切分为多批，循环调用 embeddings.create，再按 index 排序合并结果。
   - 理由：调用方只有 VectorStoreService.indexChunks，把限制收敛在 EmbeddingProvider 一处，任何未来调用 embedBatch 的地方都会自动遵守限制；无需改 vectorStore 或文档处理。
   - 备选：在 VectorStoreService.indexChunks 中分批调用 embedBatch(每批≤10)——会分散对「上游限制」的认知，且仅 indexChunks 受益，故不采用。

2. **批量上限用常量**
   - 使用模块级常量 `EMBED_BATCH_SIZE = 10`，与 DashScope 文档一致；注释标明来源（如「阿里云 DashScope 等接口限制单次 batch 不超过 10」）。
   - 理由：当前仅对接 DashScope，无多后端差异；后续若需可改为从 config.rag.embedding 读取。

## Risks / Trade-offs

- **多批请求延迟**：chunk 多时会有多轮 HTTP 请求，总耗时增加。可接受：上传为后台流程，且单批 10 条已能显著减少请求次数。
- **顺序与一致性**：按 slice 顺序分批、再按 response.data.index 排序合并，保证与输入 texts 顺序一致；现有 OpenAI SDK 返回含 index，行为明确。
