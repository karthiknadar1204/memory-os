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
  listSegmentsByIds,
} from '../../memory/mtm';
import { embed, chat } from '../../utils/openai';
import { extractKeywords, jaccard } from '../../utils/keywords';
import { ns } from '../../utils/pinecone';

// F_score threshold (paper Sec 4.1, θ = 0.6) → page joins matched segment.
const F_SCORE_THRESHOLD = 0.6;
// How many candidate segments to pull from Pinecone before F_score re-ranking.
const CANDIDATE_LIMIT = 10;

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

      // 3. Pinecone candidate search in mtm-segments namespace (filter by user_id).
      const search = await ns.mtmSegments().query({
        vector: pageVector,
        topK: CANDIDATE_LIMIT,
        filter: { user_id: userId },
        includeMetadata: true,
      });

      const candidateIds = (search.matches ?? []).map((m) => String(m.id));
      const cosineById = new Map<string, number>();
      for (const m of search.matches ?? []) {
        cosineById.set(String(m.id), m.score ?? 0);
      }

      // 4. Load candidate segments from Postgres (keywords + summary).
      const candidates = await listSegmentsByIds(candidateIds);

      // 5. Compute F_score = cosine + Jaccard for each candidate (paper Eq. 3).
      let best: { segmentId: string; fScore: number } | null = null;
      for (const seg of candidates) {
        const cosine = cosineById.get(seg.id) ?? 0;
        const jacc = jaccard(seg.keywords, pageKeywords);
        const fScore = cosine + jacc;
        if (!best || fScore > best.fScore) {
          best = { segmentId: seg.id, fScore };
        }
      }

      // 6. Decision: join or create.
      let targetSegmentId: string;
      let createdNew = false;

      if (best && best.fScore > F_SCORE_THRESHOLD) {
        // ----- Path A: join existing segment -----
        targetSegmentId = best.segmentId;
        await bumpSegmentOnJoin(targetSegmentId);
        console.log(
          `[stm-migrate] JOIN page=${pageId.slice(0, 8)} segment=${targetSegmentId.slice(0, 8)} f=${best.fScore.toFixed(3)}`,
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

        const seg = await insertSegment({
          userId,
          summary,
          keywords: pageKeywords,
        });
        targetSegmentId = seg.id;
        createdNew = true;

        // Upsert new segment vector to Pinecone (SDK v7 requires `{ records }`).
        const segVector = await embed(summary);
        await ns.mtmSegments().upsert({
          records: [
            {
              id: seg.id,
              values: segVector,
              metadata: { user_id: userId, keywords: pageKeywords },
            },
          ],
        } as any);
        console.log(
          `[stm-migrate] CREATE page=${pageId.slice(0, 8)} segment=${seg.id.slice(0, 8)} (best f=${best?.fScore.toFixed(3) ?? 'n/a'})`,
        );
      }

      // 7. Insert MTM page row.
      const mtmPage = await insertMTMPage({
        segmentId: targetSegmentId,
        userId,
        query: page.query,
        response: page.response,
        timestamp: page.timestamp,
        metaChain: page.metaChain,
        keywords: pageKeywords,
      });

      // 8. Upsert the page vector into Pinecone mtm-pages namespace.
      await ns.mtmPages().upsert({
        records: [
          {
            id: mtmPage.id,
            values: pageVector,
            metadata: { user_id: userId, segment_id: targetSegmentId },
          },
        ],
      } as any);

      // 9. Remove the page from STM (now safely in MTM + Pinecone).
      await db.delete(stmPages).where(eq(stmPages.id, pageId));

      // 10. Chain next jobs.
      //     - segment-update only when joined existing (summary needs refresh).
      //     - heat-check always.
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
    { connection, concurrency: 3 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[stm-migrate] failed job=${job?.id}`, err.message);
  });

  return worker;
}
