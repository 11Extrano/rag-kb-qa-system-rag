## 1. EmbeddingProvider 批量上限

- [x] 1.1 在 embeddingProvider 中新增常量 EMBED_BATCH_SIZE（如 10），并注释说明来源（如 DashScope 单次 batch 上限）
- [x] 1.2 在 embedBatch 中按 EMBED_BATCH_SIZE 将 texts 分批，循环调用 embeddings.create，按 response.data.index 排序后合并为与 texts 顺序一致的 embedding 数组并返回

## 2. 验证

- [x] 2.1 上传一份拆分后 chunk 数大于 10 的文档，确认向量化与入库成功、无 batch size 报错
