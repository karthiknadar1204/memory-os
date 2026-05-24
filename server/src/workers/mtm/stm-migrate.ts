import { Worker } from 'bullmq';
import { connection } from '../../queues/connection';
import { QUEUE_NAMES, type StmMigrateJob } from '../../queues';

export function startStmMigrateWorker() {
  const worker = new Worker<StmMigrateJob>(
    QUEUE_NAMES.STM_MIGRATE,
    async (job) => {
      console.log(`[stm-migrate] job=${job.id}`, job.data);
      // TODO: embed page, find/create MTM segment via F_score (cosine + Jaccard, θ=0.6),
      // upsert page to Pinecone mtm-pages namespace, delete from STM,
      // enqueue segment-update + heat-check.
      return { ok: true };
    },
    { connection, concurrency: 3 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[stm-migrate] failed job=${job?.id}`, err.message);
  });

  return worker;
}
