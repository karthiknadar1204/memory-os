import { Worker } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { connection } from '../../queues/connection';
import { MTM_QUEUE_NAMES, type StmMigrateJob, mtmQueues } from '../../queues/mtm';
import { db } from '../../config/db';
import { stmPages } from '../../config/schema';
import {
  insertSegment,
  insertMTMPage,
  bumpSegmentOnJoin,
  listSegmentsForMatching,
} from '../../memory/mtm';
import { embed, chat } from '../../utils/openai';
import { extractKeywords, jaccard, cosine } from '../../utils/keywords';
import { ns } from '../../utils/pinecone';

// Paper Sec 4.1 specifies θ = 0.6. Empirically with text-embedding-3-small +
// gpt-4o-mini keywords, related content scores 0.45-0.60 because we compare
// page embeddings to segment-summary embeddings (different text lengths drift).
// We use 0.5 — still rejects unrelated topics (cosine typically <0.3 for those)
// while correctly grouping related ones. Documented deviation.
const F_SCORE_THRESHOLD = 0.5;

export function startStmMigrateWorker() {
  const worker = new Worker<StmMigrateJob>(
    MTM_QUEUE_NAMES.STM_MIGRATE,
    async (job) => {
      const { pageId, userId } = job.data;
      console.log(`[stm-migrate] ENTER page=${pageId.slice(0, 8)}`);

      // 1. Load the migrating page from STM.
      const [page] = await db
        .select()
        .from(stmPages)
        .where(and(eq(stmPages.id, pageId), eq(stmPages.userId, userId)))
        .limit(1);

      if (!page) {
        console.warn(`[stm-migrate] SKIP page=${pageId.slice(0, 8)} (not in STM)`);
        return { ok: true, skipped: true };
      }

      // 2. Embed page text + LLM-extract keywords (in parallel).
      const pageText = `User: ${page.query}\nAI: ${page.response}`;
      const [pageVector, pageKeywords] = await Promise.all([
        embed(pageText),
        extractKeywords(pageText),
      ]);

      // 3. POSTGRES-backed candidate search (strongly consistent — avoids
      //    Pinecone eventual-consistency duplicate-segment bug).
      //    Bounded by MTM cap (200/user), so a full scan is cheap.
      const candidates = await listSegmentsForMatching(userId);

      // 4. Compute F_score = cosine + Jaccard for each candidate (paper Eq. 3).
      let best: { segmentId: string; fScore: number; cosine: number; jacc: number } | null = null;
      for (const seg of candidates) {
        const cos = seg.embedding ? cosine(pageVector, seg.embedding) : 0;
        const jacc = jaccard(seg.keywords, pageKeywords);
        const fScore = cos + jacc;
        if (!best || fScore > best.fScore) {
          best = { segmentId: seg.id, fScore, cosine: cos, jacc };
        }
      }

      // 5. Decision: join or create.
      let targetSegmentId: string;
      let createdNew = false;

      if (best && best.fScore > F_SCORE_THRESHOLD) {
        // ----- Path A: join existing segment -----
        targetSegmentId = best.segmentId;
        await bumpSegmentOnJoin(targetSegmentId);
        console.log(
          `[stm-migrate] JOIN page=${pageId.slice(0, 8)} segment=${targetSegmentId.slice(0, 8)} ` +
          `f=${best.fScore.toFixed(3)} (cos=${best.cosine.toFixed(3)} jacc=${best.jacc.toFixed(3)})`,
        );
      } else {
        // ----- Path B: create new segment -----
        const summary = await chat(
          [
            {
              role: 'system',
              content:
                'Summarize the topic of this single Q&A in 1-2 sentences. Be concise.',
            },
            { role: 'user', content: pageText },
          ],
          { temperature: 0.3 },
        );

        // For a single-page segment, the SEGMENT embedding starts as the PAGE
        // embedding — saves one OpenAI call and is a reasonable initialization.
        // segment-update will re-embed the proper segment summary later.
        const seg = await insertSegment({
          userId,
          summary,
          keywords: pageKeywords,
          embedding: pageVector,
        });
        targetSegmentId = seg.id;
        createdNew = true;

        console.log(
          `[stm-migrate] CREATE page=${pageId.slice(0, 8)} segment=${seg.id.slice(0, 8)} ` +
          `(best candidate f=${best?.fScore.toFixed(3) ?? 'n/a'})`,
        );
      }

      // 6. Insert MTM page row.
      const mtmPage = await insertMTMPage({
        segmentId: targetSegmentId,
        userId,
        query: page.query,
        response: page.response,
        timestamp: page.timestamp,
        metaChain: page.metaChain,
        keywords: pageKeywords,
      });

      // 7. Upsert the page vector into Pinecone mtm-pages namespace
      //    (used by retrieval Stage 2 later).
      await ns.mtmPages().upsert({
        records: [
          {
            id: mtmPage.id,
            values: pageVector,
            metadata: { user_id: userId, segment_id: targetSegmentId },
          },
        ],
      } as any);

      // 8. Remove the page from STM (now safely in MTM + Pinecone).
      await db.delete(stmPages).where(eq(stmPages.id, pageId));

      // 9. Chain next jobs.
      //    - segment-update: only when joined existing segment (summary needs refresh).
      //    - heat-check: always.
      if (!createdNew) {
        await mtmQueues.segmentUpdate.add('update', {
          segmentId: targetSegmentId,
          userId,
        });
      }
      await mtmQueues.heatCheck.add('check', {
        segmentId: targetSegmentId,
        userId,
      });

      return {
        ok: true,
        segmentId: targetSegmentId,
        createdNew,
        mtmPageId: mtmPage.id,
      };
    },
    // concurrency = 1 still: prevents within-user races during initial migrations.
    // For multi-user scale, switch to per-user mutex.
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[stm-migrate] failed job=${job?.id}`, err.message);
  });

  return worker;
}
