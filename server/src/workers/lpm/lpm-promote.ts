import { Worker } from 'bullmq';
import { connection } from '../../queues/connection';
import { LPM_QUEUE_NAMES, type LpmPromoteJob } from '../../queues/lpm';
import {
  getSegmentById,
  listPagesBySegment,
} from '../../memory/mtm';
import {
  insertUserKbFact,
  insertAgentTrait,
  fifoTrimUserKb,
  fifoTrimAgentTraits,
  mergeUserTraitDeltas,
  resetSegmentLInteraction,
} from '../../memory/lpm';
import { ALL_TRAIT_DIMENSIONS } from '../../constants/traits';
import { embed, chatJson } from '../../utils/openai';
import { ns } from '../../utils/pinecone';

type ExtractOut = {
  user_facts: string[];
  agent_behavior: string[];
  trait_deltas: Record<string, number>;
};

// Build a once-only system prompt that lists all 90 trait dim names so the
// LLM only emits deltas on the schema we recognize.
const SYS_PROMPT = `You are a memory-consolidation agent for a personal AI.

Given a conversation segment (Q&A pages), extract structured persona info as JSON:

1. "user_facts": list of factual statements about the USER inferred from this segment.
   - Each should be a concise self-contained sentence (e.g., "User lives in Mumbai", "User wants to lose weight").
   - Only confident, durable facts. No speculation. No transient feelings.
2. "agent_behavior": list of significant things the AI did/recommended in this segment.
   - Each should be a concise self-contained sentence (e.g., "Recommended 30 min daily cardio").
   - Captures advice given, items recommended, plans created.
3. "trait_deltas": a JSON dict mapping dimension name → delta in [-0.3, +0.3].
   - Only use keys from this list:
     ${ALL_TRAIT_DIMENSIONS.join(', ')}
   - Positive delta when the user clearly DEMONSTRATES the trait/interest;
     negative when they explicitly disinterest. Skip dims that aren't clearly demonstrated.
   - Keep deltas small (0.05-0.2 typical, 0.3 for very strong signals).

Return strict JSON: { "user_facts": string[], "agent_behavior": string[], "trait_deltas": object }`;

export function startLpmPromoteWorker() {
  const worker = new Worker<LpmPromoteJob>(
    LPM_QUEUE_NAMES.LPM_PROMOTE,
    async (job) => {
      const { segmentId, userId } = job.data;
      console.log(`[lpm-promote] ENTER segment=${segmentId.slice(0, 8)}`);

      // 1. Load segment + all its pages.
      const segment = await getSegmentById(segmentId);
      if (!segment) {
        console.warn(`[lpm-promote] SKIP segment=${segmentId.slice(0, 8)} (not found)`);
        return { ok: true, skipped: true };
      }
      const pages = await listPagesBySegment(segmentId);
      if (pages.length === 0) {
        console.warn(`[lpm-promote] SKIP segment=${segmentId.slice(0, 8)} (no pages)`);
        return { ok: true, skipped: true };
      }

      // 2. One LLM call → JSON.
      const pagesText = pages
        .map((p, i) => `Page ${i + 1}:\nUser: ${p.query}\nAI: ${p.response}`)
        .join('\n\n');

      const userMsg = `Segment summary: ${segment.summary}

Segment pages (n=${pages.length}):

${pagesText}`;

      const out = await chatJson<ExtractOut>(
        [
          { role: 'system', content: SYS_PROMPT },
          { role: 'user', content: userMsg },
        ],
        { temperature: 0.2 },
      );

      const userFacts     = (out.user_facts     ?? []).map((s) => String(s).trim()).filter(Boolean);
      const agentBehavior = (out.agent_behavior ?? []).map((s) => String(s).trim()).filter(Boolean);
      const traitDeltas   = out.trait_deltas    ?? {};

      console.log(
        `[lpm-promote] LLM extracted facts=${userFacts.length} behavior=${agentBehavior.length} deltas=${Object.keys(traitDeltas).length}`,
      );

      // 3. Insert user_kb facts (text dedup), embed, upsert to Pinecone.
      const insertedKbIds: string[] = [];
      for (const fact of userFacts) {
        const row = await insertUserKbFact({ userId, fact });
        if (!row) continue;
        try {
          const vec = await embed(fact);
          await ns.lpmUserKb().upsert({
            records: [
              { id: row.id, values: vec, metadata: { user_id: userId } },
            ],
          } as any);
          insertedKbIds.push(row.id);
        } catch (e: any) {
          console.warn(`[lpm-promote] kb upsert failed for ${row.id.slice(0,8)}: ${e.message}`);
        }
      }

      // 4. Insert agent_traits, embed, upsert to Pinecone.
      const insertedAtIds: string[] = [];
      for (const trait of agentBehavior) {
        const row = await insertAgentTrait({ userId, trait });
        if (!row) continue;
        try {
          const vec = await embed(trait);
          await ns.lpmAgentTraits().upsert({
            records: [
              { id: row.id, values: vec, metadata: { user_id: userId } },
            ],
          } as any);
          insertedAtIds.push(row.id);
        } catch (e: any) {
          console.warn(`[lpm-promote] agent-trait upsert failed for ${row.id.slice(0,8)}: ${e.message}`);
        }
      }

      // 5. Merge trait deltas into user_traits (90-dim JSON).
      const { updatedKeys } = await mergeUserTraitDeltas({ userId, deltas: traitDeltas });

      // 6. FIFO trim to 100; delete evicted vectors from Pinecone.
      const evictedKb = await fifoTrimUserKb(userId);
      const evictedAt = await fifoTrimAgentTraits(userId);

      for (const id of evictedKb) {
        await ns.lpmUserKb().deleteOne(id).catch(() => {});
      }
      for (const id of evictedAt) {
        await ns.lpmAgentTraits().deleteOne(id).catch(() => {});
      }

      // 7. Reset segment's l_interaction (paper Sec 3.3 — cooldown).
      await resetSegmentLInteraction(segmentId);

      console.log(
        `[lpm-promote] OK segment=${segmentId.slice(0, 8)} kb+=${insertedKbIds.length} at+=${insertedAtIds.length} traits+=${updatedKeys.length} evictedKb=${evictedKb.length} evictedAt=${evictedAt.length}`,
      );

      return {
        ok: true,
        segmentId,
        userFactsInserted: insertedKbIds.length,
        agentTraitsInserted: insertedAtIds.length,
        traitsUpdated: updatedKeys.length,
        kbEvicted: evictedKb.length,
        atEvicted: evictedAt.length,
      };
    },
    { connection, concurrency: 2 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[lpm-promote] failed job=${job?.id}`, err.message);
  });

  return worker;
}
