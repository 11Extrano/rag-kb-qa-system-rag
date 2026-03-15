## Context

当前文档处理流程：管理员上传文件 → 仅对 .txt/.md/.html 以 UTF-8 读取 → 写入文档表 `original_content` → 清洗 → 拆分 → 写入片段表并向量化。配置层 multipart 已允许 .pdf，但服务层未解析 PDF，若上传 PDF 会因按文本读取而得到乱码或失败。本次在文档处理层增加 PDF 文本提取，使 PDF 与现有流水线一致：提取出的文本作为「原始内容」持久化后，复用既有清洗与拆分逻辑。

约束：后端 Egg.js + TypeScript，数据存 MySQL（文档表存文本），LanceDB 存向量；不落库 PDF 二进制，不改变现有 API 契约。

## Goals / Non-Goals

**Goals:**

- 支持 .pdf 上传，在服务端从 PDF 中提取文本并写入文档表，随后与 .txt/.md/.html 共用清洗、拆分、向量化流程。
- 在现有文档处理 service 内实现 PDF 提取，不新增独立 service，符合 DDD 分层（文档处理职责归属同一应用服务）。
- 行为与现有纯文本格式一致：支持格式列表包含 .pdf，拒绝列表不变；错误语义一致（格式不支持 / 提取失败 / 清洗后为空）。

**Non-Goals:**

- 不做 PDF 内图片/表格的 OCR 或版式还原；不保证复杂版式下的完美顺序。
- 不新增对外 API 或前端页面结构变更；不改变文档表 schema（仍为文本 `original_content`）。
- 不在此变更中支持 .doc/.docx 解析（仅保持或收紧白名单与错误提示）。

## Decisions

1. **PDF 提取库选型：pdf-parse**
   - 选用 `pdf-parse`（基于 pdf.js）：Node 侧常用、API 简单（文件路径或 Buffer → Promise\<{ text }>），与现有异步流程匹配；无额外 native 依赖，便于在现有环境中安装。
   - 备选：`pdf2json`（更偏结构）、`pdfjs-dist` 直接调用（需自行封装 getTextContent）。当前以「提取整篇文本」为主，`pdf-parse` 足够且实现成本低。

2. **提取入口与实现位置**
   - 在现有 `documentProcessing.uploadDocument` 内按扩展名分支：`.pdf` 时读取文件为 Buffer，在本 service 内调用 PDF 提取（如私有方法 `extractTextFromPdf(filepath)` 或内联调用 `pdf-parse`），将返回的字符串作为 `original_content` 写入文档表；非 PDF 保持现有 `readFile(..., 'utf-8')`。
   - 不新增 `app/service/pdfExtract.ts` 等独立 service，PDF 提取逻辑仅在 `documentProcessing.ts` 内实现，与现有「文档读取 + 清洗 + 拆分」同属文档处理应用服务，符合 DDD 分层。`processDocument(docId)` 的输入假设不变（仍从文档表读已存在的文本）。

3. **错误与边界**
   - PDF 解析失败（如损坏、加密、库抛错）：与「不支持格式」区分，返回明确错误信息（如「PDF 解析失败」），不写入文档表或写入失败状态，由上层返回 4xx 及提示。
   - 提取结果为空或仅空白：与现有「清洗后文本为空」一致，在 `uploadDocument` 或后续 `processDocument` 中识别并标记失败、不进入拆分；具体可在写入后由 `processDocument` 的清洗步骤统一处理（清洗后为空则失败），避免两处重复逻辑。

4. **配置与依赖**
   - 不在本阶段增加 PDF 专属配置（如页数上限）；若后续需要，可在 `config.rag.pdf` 下扩展。依赖在 `server/package.json` 中新增 `pdf-parse`（及类型定义若存在），版本取当前稳定版。

## Risks / Trade-offs

- **[Risk] 大 PDF 或页数过多导致内存或耗时** → 当前先不做分页或流式处理；若单文件 50MB 限制仍导致问题，后续可加页数/大小上限或分批提取。
- **[Risk] 扫描版 PDF（纯图片）提取为空** → 明确为非目标，文档或错误提示中说明「仅支持可提取文本的 PDF」；若需支持扫描版，需引入 OCR（后续变更）。
- **[Trade-off] 不存 PDF 二进制** → 无法「重新提取」或审计原文件；与现有仅存文本的设计一致，若需原文件留档可日后扩展存储策略。

## Migration Plan

- 无数据迁移。部署时安装新依赖、发布新代码即可；已上传的 .txt/.md/.html 不受影响。若此前有用户上传过 .pdf 且被拒绝或失败，需重新上传以享受新行为。
- 回滚：回退代码并移除 `pdf-parse` 依赖即可；无需改表或配置。

## Open Questions

- 无。若后续需要限制 PDF 页数或单页超长，可在配置与提取层补充。
