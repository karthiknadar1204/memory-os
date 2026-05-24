import { Worker } from 'bullmq';
import { connection } from '../../queues/connection';
import { QUEUE_NAMES, type SegmentUpdateJob } from '../../queues';

export function startSegmentUpdateWorker() {
  const worker = new Worker<SegmentUpdateJob>(
    QUEUE_NAMES.SEGMENT_UPDATE,
    async (job) => {
      console.log(`[segment-update] job=${job.id}`, job.data);
      // TODO: load segment + all pages, LLM regenerate summary + keywords,
      // re-embed and upsert to Pinecone mtm-segments namespace.
      return { ok: true };
    },
    { connection, concurrency: 3 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[segment-update] failed job=${job?.id}`, err.message);
  });

  return worker;
}
