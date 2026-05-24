import { Worker } from 'bullmq';
import { connection } from '../../queues/connection';
import { MTM_QUEUE_NAMES, type MtmEvictJob } from '../../queues/mtm';
import {
  findColdestSegment,
  listPagesBySegment,
  deleteSegment,
  countUserSegments,
  MTM_SEGMENT_CAP,
} from '../../memory/mtm';
import { ns } from '../../utils/pinecone';

export function startMtmEvictWorker() {
  const worker = new Worker<MtmEvictJob>(
    MTM_QUEUE_NAMES.MTM_EVICT,
    async (job) => {
      const { userId } = job.data;
      console.log(`[mtm-evict] ENTER user=${userId.slice(0, 8)}`);

      // 0. Sanity: only evict if user is actually over the cap.
      const count = await countUserSegments(userId);
      if (count <= MTM_SEGMENT_CAP) {
        console.log(`[mtm-evict] SKIP — user has ${count} segments (cap=${MTM_SEGMENT_CAP})`);
        return { ok: true, skipped: true, segmentCount: count };
      }

      // 1. Find the coldest segment.
      const target = await findColdestSegment(userId);
      if (!target) {
        console.warn(`[mtm-evict] SKIP — no segments found for user`);
        return { ok: true, skipped: true };
      }
      console.log(
        `[mtm-evict] target segment=${target.id.slice(0, 8)} l=${target.lInteraction} nv=${target.nVisit}`,
      );

      // 2. Gather page ids BEFORE deleting from Postgres so we can clean Pinecone.
      const pages = await listPagesBySegment(target.id);
      const pageIds = pages.map((p) => p.id);

      // 3. Delete vectors from Pinecone first (idempotent — ok if some don't exist).
      //    mtm-pages: delete each by id (serverless doesn't support filter-delete).
      for (const pid of pageIds) {
        await ns.mtmPages().deleteOne(pid).catch(() => {});
      }
      //    mtm-segments: delete the segment vector.
      await ns.mtmSegments().deleteOne(target.id).catch(() => {});

      // 4. Delete from Postgres. FK ON DELETE CASCADE handles mtm_pages.
      await deleteSegment(target.id);

      console.log(
        `[mtm-evict] OK evicted segment=${target.id.slice(0, 8)} pages=${pageIds.length}`,
      );

      return {
        ok: true,
        evictedSegmentId: target.id,
        evictedPageCount: pageIds.length,
        remainingSegments: count - 1,
      };
    },
    { connection, concurrency: 2 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[mtm-evict] failed job=${job?.id}`, err.message);
  });

  return worker;
}
