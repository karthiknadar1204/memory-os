import { Worker } from 'bullmq';
import { connection } from '../../queues/connection';
import { MTM_QUEUE_NAMES, type HeatCheckJob, mtmQueues } from '../../queues/mtm';
import { lpmQueues } from '../../queues/lpm';
import {
  getSegmentById,
  countUserSegments,
  MTM_SEGMENT_CAP,
} from '../../memory/mtm';

// Paper Sec 4.1:
//   α = β = γ = 1
//   τ (promotion threshold) = 5
//   μ (recency time constant) = 1e+7 seconds
const HEAT_THRESHOLD = 5;
const MU_SECONDS = 1e7;

function computeHeat(args: {
  nVisit: number;
  lInteraction: number;
  lastAccessTime: Date;
}): number {
  const dtSec = (Date.now() - args.lastAccessTime.getTime()) / 1000;
  const rRecency = Math.exp(-dtSec / MU_SECONDS);
  return args.nVisit + args.lInteraction + rRecency;
}

export function startHeatCheckWorker() {
  const worker = new Worker<HeatCheckJob>(
    MTM_QUEUE_NAMES.HEAT_CHECK,
    async (job) => {
      const { segmentId, userId } = job.data;

      // 1. Load segment counters.
      const segment = await getSegmentById(segmentId);
      if (!segment) {
        console.warn(`[heat-check] SKIP segment=${segmentId.slice(0, 8)} (not found)`);
        return { ok: true, skipped: true };
      }

      // 2. Compute heat.
      const heat = computeHeat({
        nVisit: segment.nVisit,
        lInteraction: segment.lInteraction,
        lastAccessTime: segment.lastAccessTime,
      });

      // 3. Count user's MTM segments (for eviction trigger).
      const segCount = await countUserSegments(userId);

      console.log(
        `[heat-check] segment=${segmentId.slice(0, 8)} heat=${heat.toFixed(3)} segCount=${segCount}`,
      );

      // 4a. Promote to LPM if hot enough.
      let promoted = false;
      if (heat > HEAT_THRESHOLD) {
        await lpmQueues.lpmPromote.add(
          'promote',
          { segmentId, userId },
          // Time-bucketed jobId: prevents rapid duplicates within a minute,
          // but allows re-promotion after the segment cools and reheats later.
          { jobId: `promote-${segmentId}-${Math.floor(Date.now() / 60000)}` },
        );
        promoted = true;
      }

      // 4b. Evict the coldest segment if user is over MTM cap.
      let evicting = false;
      if (segCount > MTM_SEGMENT_CAP) {
        await mtmQueues.mtmEvict.add(
          'evict',
          { userId },
          { jobId: `evict-${userId}-${Math.floor(Date.now() / 60000)}` },
        );
        evicting = true;
      }

      return { ok: true, heat, segCount, promoted, evicting };
    },
    { connection, concurrency: 10 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[heat-check] failed job=${job?.id}`, err.message);
  });

  return worker;
}
