import { Service } from 'egg';
import OpenAI from 'openai';

const MAX_RETRIES = 2;
const TIMEOUT_MS = 60_000;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export default class LlmProviderService extends Service {
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      const { baseUrl, apiKey } = this.config.rag.llm;
      this.client = new OpenAI({
        baseURL: baseUrl,
        apiKey,
        timeout: TIMEOUT_MS,
        maxRetries: MAX_RETRIES,
      });
    }
    return this.client;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const { model, maxTokens } = this.config.rag.llm;
    const client = this.getClient();

    const response = await client.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('LLM 返回内容为空');
    }

    return content;
  }

  /**
   * 流式对话：逐段 yield 内容，配置与 chat() 一致（model、max_tokens、temperature）。
   * 错误时抛出，空 content 已忽略不 yield。
   */
  async *chatStream(messages: ChatMessage[]): AsyncGenerator<string, void, undefined> {
    const { model, maxTokens } = this.config.rag.llm;
    const client = this.getClient();

    let stream: AsyncIterable<{ choices?: Array<{ delta?: { content?: string } }> }>;
    try {
      stream = await client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.3,
        stream: true,
      }) as AsyncIterable<{ choices?: Array<{ delta?: { content?: string } }> }>;
    } catch (err: any) {
      this.logger.error('[LlmProvider] chatStream 请求失败:', err?.message ?? err);
      throw err;
    }

    try {
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content != null && content !== '') {
          yield content;
        }
      }
    } catch (err: any) {
      this.logger.error('[LlmProvider] chatStream 读流失败:', err?.message ?? err);
      throw err;
    }
  }
}
