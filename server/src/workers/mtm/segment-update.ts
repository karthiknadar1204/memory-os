import { Worker } from 'bullmq';
import { connection } from '../../queues/connection';
import { MTM_QUEUE_NAMES, type SegmentUpdateJob } from '../../queues/mtm';
import {
  getSegmentById,
  listPagesBySegment,
  updateSegmentSummary,
} from '../../memory/mtm';
import { embed, chatJson } from '../../utils/openai';
import { ns } from '../../utils/pinecone';

type SummaryOut = {
  summary: string;
  keywords: string[];
};

const SYS_PROMPT = `You maintain a per-topic summary for a personal AI's memory.

Given all Q&A pages in this segment, produce:
  - "summary": 1-3 concise sentences describing the topic/thread covered across all pages.
  - "keywords": 8-15 lowercase content tokens.
      * FIRST 3-5: BROAD topic anchors (single-word, generic enough that future related Q&As will share them — e.g., "running", "fitness").
      * REST: specific compound tokens for precision (e.g., "warm_up", "pre_workout").
      * Use stems/lemmas where natural. Exclude stop words.

Return strict JSON: { "summary": string, "keywords": string[] }`;

export function startSegmentUpdateWorker() {
  const worker = new Worker<SegmentUpdateJob>(
    MTM_QUEUE_NAMES.SEGMENT_UPDATE,
    async (job) => {
      const { segmentId, userId } = job.data;
      console.log(`[segment-update] ENTER segment=${segmentId.slice(0, 8)}`);

      // 1. Load segment + all its pages.
      const segment = await getSegmentById(segmentId);
      if (!segment) {
        console.warn(`[segment-update] SKIP segment=${segmentId.slice(0, 8)} (not found)`);
        return { ok: true, skipped: true };
      }
      const pages = await listPagesBySegment(segmentId);
      if (pages.length === 0) {
        console.warn(`[segment-update] SKIP segment=${segmentId.slice(0, 8)} (no pages)`);
        return { ok: true, skipped: true };
      }

      // 2. Build the LLM prompt covering all pages in the segment.
      const pagesText = pages
        .map((p, i) => `Page ${i + 1}:\nUser: ${p.query}\nAI: ${p.response}`)
        .join('\n\n');

      const userMsg = `Current segment summary: ${segment.summary}

Segment pages (n=${pages.length}):

${pagesText}`;

      // 3. LLM regenerates summary + keywords (paper Sec 3.2).
      const out = await chatJson<SummaryOut>(
        [
          { role: 'system', content: SYS_PROMPT },
          { role: 'user', content: userMsg },
        ],
        { temperature: 0.2 },
      );

      const newSummary = String(out.summary ?? '').trim();
      const newKeywords = (out.keywords ?? [])
        .map((k) => String(k).toLowerCase().trim())
        .filter((k) => k.length > 0);

      if (!newSummary || newKeywords.length === 0) {
        // Defensive: don't blow away good data with empty output.
        console.warn(`[segment-update] empty LLM output, keeping existing summary`);
        return { ok: true, skipped: true };
      }

      // 4. Re-embed the new summary.
      const summaryVector = await embed(newSummary);

      // 5. Update Postgres (summary + keywords + embedding for ingestion matching).
      await updateSegmentSummary({
        segmentId,
        summary: newSummary,
        keywords: newKeywords,
        embedding: summaryVector,
      });

      // 6. Mirror to Pinecone mtm-segments namespace (used by retrieval Stage 1).
      //    If this fails, retry will replay — Postgres already has the truth.
      await ns.mtmSegments().upsert({
        records: [
          {
            id: segmentId,
            values: summaryVector,
            metadata: { user_id: userId, keywords: newKeywords },
          },
        ],
      } as any);

      console.log(
        `[segment-update] OK segment=${segmentId.slice(0, 8)} pages=${pages.length} kw=${newKeywords.length}`,
      );

      return { ok: true, segmentId, pageCount: pages.length };
    },
    { connection, concurrency: 3 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[segment-update] failed job=${job?.id}`, err.message);
  });

  return worker;
}
