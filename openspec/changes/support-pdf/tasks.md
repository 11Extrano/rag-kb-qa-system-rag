## 1. 依赖

- [ ] 1.1 在 server/package.json 中新增依赖 pdf-parse（及类型定义若存在），并执行 npm install

## 2. 文档上传与处理分支（在 documentProcessing 内兼容）

- [ ] 2.1 在 documentProcessing.uploadDocument 中根据扩展名分支：.pdf 时读取文件为 Buffer，在本 service 内调用 PDF 提取（私有方法或内联 pdf-parse）得到文本，将文本作为 original_content 写入文档表；非 .pdf 保持现有 readFile(..., 'utf-8') 逻辑
- [ ] 2.2 将 documentProcessing 中支持格式列表扩展为包含 .pdf（supportedExts 或等价处），使 .pdf 不再被「不支持的文件格式」拒绝
- [ ] 2.3 对 PDF 抽取结果做空/无效判断：若提取文本为空或仅空白，不写入文档表或写入后标记失败，并返回明确错误信息；与现有「清洗后文本为空」的失败语义一致（可由 processDocument 清洗步骤统一处理，或在上传阶段提前校验）

## 3. 错误与一致性

- [ ] 3.1 PDF 解析库抛错（损坏、加密等）时捕获异常，返回明确「PDF 解析失败」类错误信息，不写入文档表
- [ ] 3.2 确认 multipart 白名单已包含 .pdf（config.default.ts）；若前端有上传格式校验，确保与后端一致允许 .pdf

## 4. 验证

- [ ] 4.1 上传 .pdf 可成功入库并进入清洗→拆分→向量化流程，问答可检索到该文档内容
- [ ] 4.2 上传不支持格式仍被拒绝；上传损坏/加密或无法提取文本的 PDF 得到明确错误提示且不产生有效文档记录

