## Why

接入阿里云 DashScope（或同类）embedding 接口时，其单次请求的 `input.contents` 数量不能超过 10。当前实现将文档拆分后的全部 chunk 一次性传给 embedding API，当 chunk 数超过 10 时会导致 `InvalidParameter: batch size is invalid, it should not be larger than 10`，文档上传与向量化流程失败。需要让批量向量化遵守上游 API 的 batch 限制，保证任意长度文档均可成功入库。

## What Changes

- **EmbeddingProvider.embedBatch**：在内部按上游允许的 batch 大小（如 10）分批调用 embedding API，再按顺序合并结果返回；单次传入的 `texts` 数量可大于 10，对外接口不变。
- **常量与配置**：引入批量上限常量（如 `EMBED_BATCH_SIZE = 10`），与 DashScope 限制一致；若未来支持配置化，可放在 `config.rag.embedding` 下。

## Capabilities

### New Capabilities

- （无：本变更仅修正既有能力在批量场景下的行为。）

### Modified Capabilities

- `vector-store`: 向量写入流程所依赖的「批量文本 → 向量」调用，需满足「单次请求条数不超过上游限制」的约束；实现上由 EmbeddingProvider 内部分批，vector-store 的接口与行为不变。

## Impact

- **代码**：仅影响 `server/app/service/embeddingProvider.ts`（embedBatch 内部分批逻辑及常量）。
- **API / 行为**：无对外 API 变更；文档上传、向量索引流程在 chunk 数 > 10 时由报错变为正常完成。
- **依赖**：无新增依赖；与现有 OpenAI-compatible / DashScope 使用方式兼容。
