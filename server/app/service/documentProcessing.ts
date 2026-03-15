import { Service } from 'egg';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse') as (buffer: Buffer, options?: { pagerender?: (pageData: any) => Promise<string> }) => Promise<{ text: string }>;

export interface ChunkResult {
  chunkId: string;
  docId: string;
  text: string;
  metadata: Record<string, unknown> | null;
}

/** 当前支持的上传格式：纯文本按 UTF-8 读取，其余按格式解析后得到文本 */
const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.html', '.pdf'] as const;

export default class DocumentProcessingService extends Service {

  /**
   * 上传文档：接收文件，按格式提取文本并持久化到文档表。
   * 返回 doc_id。
   */
  async uploadDocument(file: { filepath: string; filename: string }): Promise<string> {
    const ext = path.extname(file.filename).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext as typeof SUPPORTED_EXTENSIONS[number])) {
      throw new Error(`不支持的文件格式: ${ext}，当前支持: ${SUPPORTED_EXTENSIONS.join(', ')}`);
    }

    const docId = uuidv4();
    const content = await this.extractFileContent(file.filepath, ext);

    await this.ctx.model.Document.create({
      doc_id: docId,
      filename: file.filename,
      original_content: content,
      status: 'uploaded',
    });

    return docId;
  }

  /**
   * 按扩展名从文件中提取纯文本，供入库与后续清洗/拆分使用。
   * 新增格式时：在 SUPPORTED_EXTENSIONS 中增加扩展名，在此处增加分支并实现对应 extractXxx。
   */
  private async extractFileContent(filepath: string, ext: string): Promise<string> {
    switch (ext) {
      case '.txt':
      case '.md':
      case '.html':
        return fs.promises.readFile(filepath, 'utf-8');
      case '.pdf':
        return this.extractTextFromPdf(filepath);
      default:
        throw new Error(`不支持的文件格式: ${ext}`);
    }
  }

  /**
   * PDF 文本提取：读入 Buffer 后交由 pdf-parse 解析，空结果或解析异常统一抛出明确错误。
   */
  private async extractTextFromPdf(filepath: string): Promise<string> {
    try {
      const buffer = await fs.promises.readFile(filepath);
      const result = await pdfParse(buffer);
      const text = (result?.text ?? '').trim();
      if (!text) {
        throw new Error('PDF 提取结果为空或无效，无法入库');
      }
      return text;
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('提取结果为空') || message.includes('无效')) {
        throw err;
      }
      throw new Error('PDF 解析失败');
    }
  }

  /**
   * 文本清洗：规范化空白、去除控制字符，产出清洗后全文。
   */
  cleanText(raw: string): string {
    let text = raw;
    // 去除 BOM
    text = text.replace(/^\uFEFF/, '');
    // 去除不可见控制字符（保留换行和制表符）
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    // 规范化连续空行为最多两个换行
    text = text.replace(/\n{3,}/g, '\n\n');
    // 去除行尾空白
    text = text.replace(/[ \t]+$/gm, '');
    // trim 整体
    text = text.trim();
    return text;
  }

  /**
   * 文本拆分（两段式）：
   * 第一段 - 可选按标题/结构切大块
   * 第二段 - 按段落/句子 + 最大长度 + 重叠切分
   */
  splitText(text: string): Array<{ text: string; metadata: Record<string, unknown> | null }> {
    const { splitByHeading, maxLength, overlap } = this.config.rag.chunk;

    let sections: Array<{ heading: string | null; content: string }>;

    if (splitByHeading) {
      sections = this.splitByHeadings(text);
    } else {
      sections = [{ heading: null, content: text }];
    }

    const chunks: Array<{ text: string; metadata: Record<string, unknown> | null }> = [];

    for (const section of sections) {
      const subChunks = this.splitByLengthWithOverlap(section.content, maxLength, overlap);
      for (const chunk of subChunks) {
        chunks.push({
          text: chunk,
          metadata: section.heading ? { heading: section.heading } : null,
        });
      }
    }

    return chunks;
  }

  /**
   * 第一段：按 Markdown 标题切分为大块。
   */
  private splitByHeadings(text: string): Array<{ heading: string | null; content: string }> {
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    const sections: Array<{ heading: string | null; content: string }> = [];
    let lastIndex = 0;
    let lastHeading: string | null = null;
    let match: RegExpExecArray | null;

    while ((match = headingRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const content = text.slice(lastIndex, match.index).trim();
        if (content) {
          sections.push({ heading: lastHeading, content });
        }
      }
      lastHeading = match[2].trim();
      lastIndex = match.index + match[0].length;
    }

    const remaining = text.slice(lastIndex).trim();
    if (remaining) {
      sections.push({ heading: lastHeading, content: remaining });
    }

    if (sections.length === 0) {
      sections.push({ heading: null, content: text });
    }

    return sections;
  }

  /**
   * 第二段：按段落/句子 + 最大长度 + 重叠切分。
   * 递归分隔符：先按 \n\n，再按 \n，再按句号/问号/叹号，最后按空格。
   */
  private splitByLengthWithOverlap(text: string, maxLength: number, overlap: number): string[] {
    if (text.length <= maxLength) {
      return text.trim() ? [text.trim()] : [];
    }

    const separators = ['\n\n', '\n', '。', '？', '！', '. ', '? ', '! ', ' '];
    const rawParts = this.recursiveSplit(text, separators, maxLength);

    const chunks: string[] = [];
    let buffer = '';

    for (const part of rawParts) {
      if (buffer && (buffer.length + part.length) > maxLength) {
        chunks.push(buffer.trim());
        const overlapText = buffer.slice(Math.max(0, buffer.length - overlap));
        buffer = overlapText + part;
      } else {
        buffer += part;
      }
    }

    if (buffer.trim()) {
      chunks.push(buffer.trim());
    }

    return chunks;
  }

  private recursiveSplit(text: string, separators: string[], maxLength: number): string[] {
    if (text.length <= maxLength || separators.length === 0) {
      return [text];
    }

    const sep = separators[0];
    const parts = text.split(sep);

    if (parts.length <= 1) {
      return this.recursiveSplit(text, separators.slice(1), maxLength);
    }

    const results: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const part = i < parts.length - 1 ? parts[i] + sep : parts[i];
      if (part.length > maxLength) {
        results.push(...this.recursiveSplit(part, separators.slice(1), maxLength));
      } else {
        results.push(part);
      }
    }

    return results;
  }

  /**
   * 完整流水线：上传完成后自动触发清洗→拆分→写入 chunks 表。
   * 返回产出的 chunk 列表（供向量存储消费）。
   */
  async processDocument(docId: string): Promise<ChunkResult[]> {
    const doc = await this.ctx.model.Document.findOne({ where: { doc_id: docId } });
    if (!doc) {
      throw new Error(`文档不存在: ${docId}`);
    }

    const docData = doc.get() as { original_content: string; status: string };

    // 清洗
    await doc.update({ status: 'cleaning' });
    const cleanedText = this.cleanText(docData.original_content);

    if (!cleanedText) {
      await doc.update({ status: 'failed' });
      throw new Error(`文档清洗后内容为空: ${docId}`);
    }

    await doc.update({ status: 'cleaned' });

    // 拆分
    await doc.update({ status: 'splitting' });
    const textChunks = this.splitText(cleanedText);

    const chunkResults: ChunkResult[] = [];

    for (const chunk of textChunks) {
      const chunkId = uuidv4();
      await this.ctx.model.Chunk.create({
        chunk_id: chunkId,
        doc_id: docId,
        text: chunk.text,
        metadata: chunk.metadata,
      });
      chunkResults.push({
        chunkId,
        docId,
        text: chunk.text,
        metadata: chunk.metadata,
      });
    }

    await doc.update({ status: 'completed' });

    return chunkResults;
  }
}
