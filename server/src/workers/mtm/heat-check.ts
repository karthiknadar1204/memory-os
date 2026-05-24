import { Worker } from 'bullmq';
import { connection } from '../../queues/connection';
import { QUEUE_NAMES, type HeatCheckJob } from '../../queues';

export function startHeatCheckWorker() {
  const worker = new Worker<HeatCheckJob>(
    QUEUE_NAMES.HEAT_CHECK,
    async (job) => {
      console.log(`[heat-check] job=${job.id}`, job.data);
      // TODO: compute Heat = n_visit + l_interaction + exp(-Δt/μ).
      // If > τ=5 → enqueue lpm-promote. If user segments > 200 → enqueue mtm-evict.
      // No DB writes here — purely a router.
      return { ok: true };
    },
    { connection, concurrency: 10 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[heat-check] failed job=${job?.id}`, err.message);
  });

  return worker;
}
