import { Worker } from 'bullmq';
import { and, desc, eq, ne } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { connection } from '../../queues/connection';
import { QUEUE_NAMES, type ChainSummarizeJob } from '../../queues';
import { db } from '../../config/db';
import { stmPages } from '../../config/schema';
import { chatJson } from '../../utils/openai';

// How many prior STM pages we feed to the LLM for chain-linkage context.
const CONTEXT_PAGES = 3;

type LinkDecision = {
  continues: boolean;
  summary: string;
};

const SYS_PROMPT = `You are a memory summarization assistant for a personal AI's conversation log.

You are given:
  - The previous chain summary (or "none")
  - The last few prior Q&A pages
  - The latest Q&A page

Decide:
  1. Does the latest Q&A continue the same topic/thread as the prior pages?
     - "continues": true if same topic.
     - "continues": false if topic switched.
  2. Produce a concise summary (1-3 sentences) of the topic.
     - If continues=true: summarize the whole chain INCLUDING the latest page.
     - If continues=false: summarize JUST the latest page (it starts a new chain).

Return strict JSON: { "continues": boolean, "summary": string }`;

export function startChainSummarizeWorker() {
  const worker = new Worker<ChainSummarizeJob>(
    QUEUE_NAMES.CHAIN_SUMMARIZE,
    async (job) => {
      const { pageId, userId } = job.data;
      console.log(`[chain-summarize] ENTER job=${job.id} page=${pageId.slice(0, 8)}`);

      // 1. Load the newly-created page.
      const [page] = await db
        .select()
        .from(stmPages)
        .where(and(eq(stmPages.id, pageId), eq(stmPages.userId, userId)))
        .limit(1);

      if (!page) {
        console.warn(`[chain-summarize] SKIP page=${pageId.slice(0, 8)} (not found)`);
        return { ok: true, skipped: true };
      }

      // 2. Load up to N most recent prior pages (excluding this one), newest first.
      const priorPagesNewestFirst = await db
        .select()
        .from(stmPages)
        .where(and(eq(stmPages.userId, userId), ne(stmPages.id, pageId)))
        .orderBy(desc(stmPages.timestamp))
        .limit(CONTEXT_PAGES);

      const previousChainId = priorPagesNewestFirst[0]?.chainId ?? null;
      const previousChainSummary = priorPagesNewestFirst[0]?.metaChain ?? null;

      const priorPagesOldestFirst = priorPagesNewestFirst.slice().reverse();
      const priorText =
        priorPagesOldestFirst
          .map(
            (p, i) =>
              `Prior Q&A ${i + 1}:\nUser: ${p.query}\nAI: ${p.response}`,
          )
          .join('\n\n') || '(no prior pages)';

      // 3. One LLM call → JSON { continues, summary }.
      const decision = await chatJson<LinkDecision>([
        { role: 'system', content: SYS_PROMPT },
        {
          role: 'user',
          content: `Previous chain summary: ${previousChainSummary ?? 'none'}

${priorText}

Latest Q&A:
User: ${page.query}
AI: ${page.response}`,
        },
      ]);

      // 4. Decide chain_id: reuse if continues + we have a prior chain; else new.
      const chainId =
        decision.continues && previousChainId
          ? previousChainId
          : randomUUID();

      // 5. Persist back to the STM page.
      await db
        .update(stmPages)
        .set({ chainId, metaChain: decision.summary })
        .where(eq(stmPages.id, pageId));

      console.log(
        `[chain-summarize] page=${pageId.slice(0, 8)} continues=${decision.continues} chain=${chainId.slice(0, 8)}`,
      );

      return { ok: true, chainId, continues: decision.continues };
    },
    { connection, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[chain-summarize] failed job=${job?.id}`, err.message);
  });

  return worker;
}
