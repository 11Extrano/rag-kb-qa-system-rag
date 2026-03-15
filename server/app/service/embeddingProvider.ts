import { Service } from 'egg';
import OpenAI from 'openai';

const MAX_RETRIES = 2;
const TIMEOUT_MS = 30_000;
/** 阿里云 DashScope 等接口限制单次 batch 不超过 10 */
const EMBED_BATCH_SIZE = 10;

export default class EmbeddingProviderService extends Service {
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      const { baseUrl, apiKey } = this.config.rag.embedding;
      this.client = new OpenAI({
        baseURL: baseUrl,
        apiKey,
        timeout: TIMEOUT_MS,
        maxRetries: MAX_RETRIES,
      });
    }
    return this.client;
  }

  async embed(text: string): Promise<number[]> {
    const { model } = this.config.rag.embedding;
    const client = this.getClient();

    const response = await client.embeddings.create({
      model,
      input: text,
    });

    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const { model } = this.config.rag.embedding;
    const client = this.getClient();
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
      const response = await client.embeddings.create({
        model,
        input: batch,
      });
      const sorted = response.data
        .sort((a, b) => a.index - b.index)
        .map(item => item.embedding);
      allEmbeddings.push(...sorted);
    }

    return allEmbeddings;
  }
}
