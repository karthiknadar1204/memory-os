import { chatJson } from './openai';

// ---------- LLM keyword extraction (paper Sec 3.2: Ks, Kp are LLM-summarized) ----------

const SYS_PROMPT = `You extract content keywords from text for a memory system.
Rules:
  - Return 5-12 lowercase, single-word or compound tokens (e.g., "weight_loss").
  - Use stems/lemmas where natural (e.g., "run" not "running").
  - Exclude stop words and generic words.
  - Focus on topic, entities, actions, and qualifiers.
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
