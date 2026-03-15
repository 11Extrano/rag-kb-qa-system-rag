## Why

PDF 是企业内最常用的文档格式（手册、合同、报告等），当前系统在配置层已允许 .pdf 上传，但文档处理服务仅对纯文本（.txt/.md/.html）做 UTF-8 读取，未对 PDF 做真实解析，导致 PDF 无法被正确纳入知识库。本次变更为上传的 PDF 增加文本提取能力，使其与现有清洗→拆分→向量化流水线衔接，扩大知识库可用的文档来源。

## What Changes

- 支持管理员上传 .pdf 文件，并在服务端对 PDF 进行文本提取（非 UTF-8 直接读取）。
- 提取出的文本与现有 .txt/.md/.html 一样，经清洗、拆分后写入片段表并参与向量化与检索。
- 保持对 .txt、.md、.html 的现有行为不变；不支持 PDF 内嵌图片/表格的 OCR 或版式还原，仅提取可抽取的文本。
- 配置层已包含 .pdf 的 multipart 白名单，无需修改；文档处理层需根据扩展名分支：PDF 走提取逻辑，其余走现有读文件逻辑。

## Capabilities

### New Capabilities

（无新增独立能力，仅扩展现有文档处理能力。）

### Modified Capabilities

- **document-processing**：在「系统接受管理员上传文档」下增加对 .pdf 的支持：接受 .pdf 上传后，必须先从 PDF 中提取文本再持久化/清洗；并增加场景「管理员上传 PDF 时系统提取文本并走后续流水线」与「PDF 提取结果为空或无效时记录失败、不继续拆分」。

## Impact

- **代码**：在现有 `server/app/service/documentProcessing.ts` 内兼容实现：按扩展名分支，PDF 时调用 PDF 提取库（如 pdf-parse）得到文本并写入 `original_content`；不新增独立 service，符合 DDD 下文档处理职责归属同一应用层服务的分层方式。
- **依赖**：新增 Node 侧 PDF 文本提取库（如 `pdf-parse` 或 `pdf2json`），需兼容当前 Node 版本与 Egg 环境。
- **配置**：`server/config/config.default.ts` 中 multipart 已包含 .pdf，可保持；若需限制 PDF 页数或大小可在此或 `rag` 下扩展。
- **API**：上传接口 `/api/admin/documents` 行为不变，仅后端对 .pdf 的处理从「拒绝或错误」变为「提取文本后处理」；前端若已有 .pdf 校验可保留与后端一致。
- **存储**：文档表 `original_content` 仍存文本形态，PDF 二进制不落库，与现有设计一致。
