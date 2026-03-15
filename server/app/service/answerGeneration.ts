import { Service } from 'egg';
import { MatchedContent } from './retrievalMatch';
import { ChatMessage } from './llmProvider';

export interface Citation {
  chunkId: string;
  docId: string;
  filename: string;
  text: string;
  score: number;
}

export interface AnswerResult {
  answer: string;
  citations: Citation[];
}

const SYSTEM_PROMPT = `你是一个知识库助手。请仅根据下面【参考内容】回答用户问题。
如果参考内容中无法得到答案，请如实说明"根据现有知识库内容，无法回答该问题"，不要编造信息。
回答时请尽量引用来源（如文档名、片段编号），以便用户核实。`;

export default class AnswerGenerationService extends Service {

  /**
   * 完整答案生成流程：
   * 1. 若无检索结果，返回友好提示（不调用 LLM）
   * 2. 格式化参考内容
   * 3. 组装 prompt（System + User）
   * 4. 调用 LLM 生成答案
   * 5. 返回 answer + 引用列表
   */
  async generateAnswer(question: string, matchedContents: MatchedContent[]): Promise<AnswerResult> {
    if (matchedContents.length === 0) {
      return {
        answer: '当前知识库中暂无相关内容，无法回答您的问题。请确认知识库中已上传相关文档。',
        citations: [],
      };
    }

    const referenceText = this.formatReferences(matchedContents);

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `【参考内容】\n${referenceText}\n\n【用户问题】\n${question}`,
      },
    ];

    let answer: string;
    try {
      answer = await this.service.llmProvider.chat(messages);
    } catch (err: any) {
      this.logger.error('[AnswerGeneration] LLM 调用失败:', err.message);
      answer = this.buildFallbackAnswer(matchedContents);
    }

    const citations: Citation[] = matchedContents.map(mc => ({
      chunkId: mc.chunkId,
      docId: mc.docId,
      filename: mc.filename,
      text: mc.text.length > 200 ? mc.text.slice(0, 200) + '...' : mc.text,
      score: mc.score,
    }));

    return { answer, citations };
  }

  /**
   * 将匹配内容格式化为可读的参考内容文本，标注来源。
   */
  private formatReferences(contents: MatchedContent[]): string {
    return contents.map((mc, index) => {
      const source = `[来源: ${mc.filename}, 片段: ${mc.chunkId.slice(0, 8)}]`;
      return `参考${index + 1} ${source}:\n${mc.text}`;
    }).join('\n\n---\n\n');
  }

  /**
   * LLM 调用失败时的兜底：直接返回检索到的片段内容。
   */
  private buildFallbackAnswer(contents: MatchedContent[]): string {
    const snippets = contents.slice(0, 3).map((mc, i) =>
      `${i + 1}. [${mc.filename}] ${mc.text.slice(0, 300)}${mc.text.length > 300 ? '...' : ''}`,
    ).join('\n\n');

    return `抱歉，答案生成服务暂时不可用。以下是与您问题最相关的知识库片段，供参考：\n\n${snippets}`;
  }

  /**
   * 流式生成答案：先逐段 yield 文本（type: 'chunk'），最后 yield 引用列表（type: 'citations'）。
   * 无匹配时 yield 友好提示后 yield 空 citations。
   */
  async *generateAnswerStream(
    question: string,
    matchedContents: MatchedContent[],
  ): AsyncGenerator<{ type: 'chunk'; text: string } | { type: 'citations'; citations: Citation[] }, void, undefined> {
    const citations: Citation[] = matchedContents.map(mc => ({
      chunkId: mc.chunkId,
      docId: mc.docId,
      filename: mc.filename,
      text: mc.text.length > 200 ? mc.text.slice(0, 200) + '...' : mc.text,
      score: mc.score,
    }));

    if (matchedContents.length === 0) {
      yield { type: 'chunk', text: '当前知识库中暂无相关内容，无法回答您的问题。请确认知识库中已上传相关文档。' };
      yield { type: 'citations', citations: [] };
      return;
    }

    const referenceText = this.formatReferences(matchedContents);
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `【参考内容】\n${referenceText}\n\n【用户问题】\n${question}`,
      },
    ];

    try {
      for await (const text of this.service.llmProvider.chatStream(messages)) {
        yield { type: 'chunk', text };
      }
    } catch (err: any) {
      this.logger.error('[AnswerGeneration] 流式 LLM 调用失败:', err.message);
      yield { type: 'chunk', text: this.buildFallbackAnswer(matchedContents) };
    }

    yield { type: 'citations', citations };
  }
}
