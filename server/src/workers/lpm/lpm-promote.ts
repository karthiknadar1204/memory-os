import { Worker } from 'bullmq';
import { connection } from '../../queues/connection';
import { QUEUE_NAMES, type LpmPromoteJob } from '../../queues';

export function startLpmPromoteWorker() {
  const worker = new Worker<LpmPromoteJob>(
    QUEUE_NAMES.LPM_PROMOTE,
    async (job) => {
      console.log(`[lpm-promote] job=${job.id}`, job.data);
      // TODO: LLM-extract { user_facts, agent_behavior, trait_deltas } from segment.
      // Insert into user_kb / agent_traits (FIFO 100, also Pinecone),
      // merge trait_deltas into user_traits (90-dim JSON).
      // Reset mtm_segments.l_interaction = 0 (paper Sec 3.3).
      return { ok: true };
    },
    { connection, concurrency: 2 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[lpm-promote] failed job=${job?.id}`, err.message);
  });

  return worker;
}
