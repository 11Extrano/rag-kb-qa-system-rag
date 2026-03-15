import { Controller } from 'egg';

function sseEvent(event: string, data: string): string {
  const dataLines = data.split('\n').map(line => `data: ${line}`).join('\n');
  return `event: ${event}\n${dataLines || 'data: '}\n\n`;
}

export default class QaController extends Controller {

  /**
   * POST /api/qa
   * 用户问答接口：接收 question（可选 stream），返回 answer + 引用；stream=true 时以 SSE 流式返回。
   */
  async ask() {
    const { ctx } = this;
    const { question, stream: wantStream } = ctx.request.body as { question?: string; stream?: boolean };

    if (!question || !question.trim()) {
      ctx.status = 400;
      ctx.body = { success: false, message: 'question 不能为空' };
      return;
    }

    if (wantStream === true) {
      await this.askStream(ctx, question);
      return;
    }

    try {
      const matchedContents = await ctx.service.retrievalMatch.retrieve(question);
      const result = await ctx.service.answerGeneration.generateAnswer(question, matchedContents);
      ctx.body = {
        success: true,
        data: {
          question,
          answer: result.answer,
          citations: result.citations,
        },
      };
    } catch (err: any) {
      ctx.logger.error('[QA] 问答失败:', err);
      ctx.status = 500;
      ctx.body = { success: false, message: err.message };
    }
  }

  private async askStream(ctx: any, question: string) {
    const writeErrorAndClose = (message: string) => {
      try {
        ctx.res.write(sseEvent('error', message));
      } catch (_) { /* ignore */ }
      try {
        ctx.res.end();
      } catch (_) { /* ignore */ }
    };

    ctx.set('Content-Type', 'text/event-stream');
    ctx.set('Cache-Control', 'no-cache');
    ctx.set('Connection', 'keep-alive');
    ctx.status = 200;
    (ctx as any).respond = false;
    ctx.res.flushHeaders();

    try {
      const matchedContents = await ctx.service.retrievalMatch.retrieve(question);
      const stream = ctx.service.answerGeneration.generateAnswerStream(question, matchedContents);

      for await (const item of stream) {
        if (item.type === 'chunk') {
          ctx.res.write(sseEvent('chunk', item.text));
        } else if (item.type === 'citations') {
          ctx.res.write(sseEvent('citations', JSON.stringify(item.citations)));
          ctx.res.write(sseEvent('done', '{}'));
        }
      }
    } catch (err: any) {
      ctx.logger.error('[QA] 流式问答失败:', err);
      writeErrorAndClose(err?.message ?? String(err));
      return;
    }

    try {
      ctx.res.end();
    } catch (_) { /* ignore */ }
  }
}
