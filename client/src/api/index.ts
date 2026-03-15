import type { ApiResponse, DocumentItem, QaResult, QaCitation } from '../types';

const BASE = '/api';

export interface AskQuestionStreamCallbacks {
  onChunk: (text: string) => void;
  onCitations: (citations: QaCitation[]) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

async function request<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE}${url}`, init);

  let json: ApiResponse<T>;
  try {
    json = await res.json();
  } catch {
    throw new Error(`请求失败（HTTP ${res.status}）`);
  }

  if (!json.success) {
    throw new Error(json.message || '请求失败');
  }
  return json;
}

export async function fetchDocuments(): Promise<DocumentItem[]> {
  const res = await request<DocumentItem[]>('/admin/documents');
  return res.data ?? [];
}

export async function uploadDocument(file: File): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  await request('/admin/documents', { method: 'POST', body: formData });
}

export async function deleteDocument(docId: string): Promise<void> {
  await request(`/admin/documents/${docId}`, { method: 'DELETE' });
}

export async function askQuestion(question: string): Promise<QaResult> {
  const res = await request<QaResult>('/qa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  return res.data!;
}

/**
 * 流式问答：POST /api/qa body { question, stream: true }，按 SSE 解析并回调 onChunk / onCitations / onDone / onError。
 */
export function askQuestionStream(
  question: string,
  callbacks: AskQuestionStreamCallbacks,
): { abort: () => void } {
  const controller = new AbortController();
  const { onChunk, onCitations, onDone, onError } = callbacks;

  (async () => {
    const res = await fetch(`${BASE}/qa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, stream: true }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text();
      let msg = `请求失败（HTTP ${res.status}）`;
      try {
        const j = JSON.parse(text);
        if (j.message) msg = j.message;
      } catch (_) { /* ignore */ }
      onError(msg);
      return;
    }

    const contentType = res.headers.get('Content-Type') || '';
    if (!contentType.includes('text/event-stream')) {
      onError('响应不是流式格式');
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          let event = '';
          const dataLines: string[] = [];
          for (const line of part.split('\n')) {
            if (line.startsWith('event:')) event = line.replace(/^event:\s*/, '').trim();
            else if (line.startsWith('data:')) dataLines.push(line.replace(/^data:\s*/, ''));
          }
          const data = dataLines.join('\n');
          if (event === 'chunk') onChunk(data);
          else if (event === 'citations') {
            try {
              onCitations(JSON.parse(data || '[]'));
            } catch (_) {
              onCitations([]);
            }
          } else if (event === 'done') onDone();
          else if (event === 'error') onError(data || '未知错误');
        }
      }
      if (buffer.trim()) {
        let event = '';
        const dataLines: string[] = [];
        for (const line of buffer.split('\n')) {
          if (line.startsWith('event:')) event = line.replace(/^event:\s*/, '').trim();
          else if (line.startsWith('data:')) dataLines.push(line.replace(/^data:\s*/, ''));
        }
        const data = dataLines.join('\n');
        if (event === 'chunk') onChunk(data);
        else if (event === 'citations') {
          try {
            onCitations(JSON.parse(data || '[]'));
          } catch (_) {
            onCitations([]);
          }
        } else if (event === 'done') onDone();
        else if (event === 'error') onError(data || '未知错误');
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      onError(e?.message || '流式读取失败');
    } finally {
      onDone();
    }
  })();

  return {
    abort: () => controller.abort(),
  };
}
