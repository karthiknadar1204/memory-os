import { db } from '../config/db';
import { users, mtmSegments } from '../config/schema';
import { eq, desc } from 'drizzle-orm';
import { mtmQueues } from '../queues/mtm';
import { lpmQueues } from '../queues/lpm';

// 1. Find latest user.
const [u] = await db
  .select()
  .from(users)
  .orderBy(desc(users.createdAt))
  .limit(1);
console.log('user:', u.email);

// 2. Find their first segment.
const segs = await db.select().from(mtmSegments).where(eq(mtmSegments.userId, u.id));
if (segs.length === 0) {
  console.error('no segments — run a chat first');
  process.exit(1);
}
const target = segs[0];
console.log('target segment:', target.id.slice(0, 8), `l_interaction=${target.lInteraction}`);

// 3. Bump l_interaction high so heat > 5.
await db
  .update(mtmSegments)
  .set({ lInteraction: 8, nVisit: 2 })
  .where(eq(mtmSegments.id, target.id));
console.log('bumped l_interaction=8, n_visit=2 → heat ≈ 11');

// 4. Get baseline lpm-promote count.
const before = await lpmQueues.lpmPromote.getJobCounts('completed', 'waiting', 'active');
console.log('lpm-promote before:', before);

// 5. Enqueue heat-check job.
await mtmQueues.heatCheck.add(
  'check',
  { segmentId: target.id, userId: u.id },
  { jobId: `heat-check-test-${Date.now()}` },
);
console.log('enqueued heat-check');

// 6. Wait + observe.
await new Promise((r) => setTimeout(r, 5000));
const after = await lpmQueues.lpmPromote.getJobCounts('completed', 'waiting', 'active');
console.log('lpm-promote after:', after);

const hc = await mtmQueues.heatCheck.getJobs(['completed'], 0, 5, false);
console.log('most recent heat-check return:', hc[0]?.returnvalue);

process.exit(0);
