import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not set');
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Models pinned in one place so you can change them globally.
export const MODELS = {
  CHAT: 'gpt-4o-mini',
  EMBED: 'text-embedding-3-small',  // 1536 dimensions
} as const;

export const EMBED_DIM = 1536;

// ---------- Embeddings ----------

export async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: MODELS.EMBED,
    input: text,
  });
  return res.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await openai.embeddings.create({
    model: MODELS.EMBED,
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

// ---------- Chat completion (plain text response) ----------

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function chat(
  messages: ChatMessage[],
  opts: { temperature?: number; model?: string } = {}
): Promise<string> {
  const res = await openai.chat.completions.create({
    model: opts.model ?? MODELS.CHAT,
    temperature: opts.temperature ?? 0.7,
    messages,
  });
  return res.choices[0].message.content ?? '';
}

// ---------- Chat completion (JSON response) ----------

export async function chatJson<T = unknown>(
  messages: ChatMessage[],
  opts: { temperature?: number; model?: string } = {}
): Promise<T> {
  const res = await openai.chat.completions.create({
    model: opts.model ?? MODELS.CHAT,
    temperature: opts.temperature ?? 0.2,
    response_format: { type: 'json_object' },
    messages,
  });
  const raw = res.choices[0].message.content ?? '{}';
  return JSON.parse(raw) as T;
}
