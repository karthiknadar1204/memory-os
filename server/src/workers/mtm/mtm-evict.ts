import { Worker } from 'bullmq';
import { connection } from '../../queues/connection';
import { QUEUE_NAMES, type MtmEvictJob } from '../../queues';

export function startMtmEvictWorker() {
  const worker = new Worker<MtmEvictJob>(
    QUEUE_NAMES.MTM_EVICT,
    async (job) => {
      console.log(`[mtm-evict] job=${job.id}`, job.data);
      // TODO: find lowest-heat segment for user, cascade-delete pages + segment
      // from Postgres, delete vectors from Pinecone (mtm-segments + mtm-pages).
      return { ok: true };
    },
    { connection, concurrency: 2 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[mtm-evict] failed job=${job?.id}`, err.message);
  });

  return worker;
}
