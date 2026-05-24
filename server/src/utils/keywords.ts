import { chatJson } from './openai';

// ---------- LLM keyword extraction (paper Sec 3.2: Ks, Kp are LLM-summarized) ----------

const SYS_PROMPT = `You extract content keywords from text for a memory system that groups related conversations.

Return 8-15 lowercase keyword tokens organized as:
  - FIRST 3-5 keywords: BROAD topic anchors — single-word, generic enough that related Q&As about the same broader topic will share them (e.g., for "best warmup before a run", include "running", "exercise", "fitness").
  - REST: more specific compound tokens (e.g., "warm_up", "weight_loss") for precision.

Other rules:
  - Use stems/lemmas where natural (e.g., "run" not "running" — but if both are common, pick "running").
  - Exclude stop words and pure generic words ("thing", "way").
  - Cover topic, entities, actions, and qualifiers.

Return strict JSON: { "keywords": string[] }`;

export async function extractKeywords(text: string): Promise<string[]> {
  if (!text.trim()) return [];
  const { keywords } = await chatJson<{ keywords: string[] }>([
    { role: 'system', content: SYS_PROMPT },
    { role: 'user', content: text },
  ]);
  return (keywords ?? [])
    .map((k) => String(k).toLowerCase().trim())
    .filter((k) => k.length > 0);
}

// ---------- Cosine similarity (in-app) ----------

export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ---------- Jaccard similarity ----------

export function jaccard(a: readonly string[], b: readonly string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;

  let intersect = 0;
  for (const x of setA) if (setB.has(x)) intersect++;
  const union = setA.size + setB.size - intersect;
  return union === 0 ? 0 : intersect / union;
}
