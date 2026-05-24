import { db } from '../config/db';
import { users, mtmSegments } from '../config/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { mtmQueues } from '../queues/mtm';
import { ns } from '../utils/pinecone';
import { MTM_SEGMENT_CAP } from '../memory/mtm';

// 1. Latest user.
const [u] = await db.select().from(users).orderBy(desc(users.createdAt)).limit(1);
console.log('user:', u.email);

// 2. Wipe their existing segments to start clean.
await db.delete(mtmSegments).where(eq(mtmSegments.userId, u.id));

// 3. Seed 205 segments with varying heat.
//    Make one segment GUARANTEED-coldest: tiny l, 0 visits, OLD last_access_time.
const COLD_SEGMENT_ID = crypto.randomUUID();
const SEED_TOTAL = MTM_SEGMENT_CAP + 5;   // 205
console.log(`seeding ${SEED_TOTAL} segments (cap=${MTM_SEGMENT_CAP}) including 1 known-coldest`);

const inserts: any[] = [];
inserts.push({
  id: COLD_SEGMENT_ID,
  userId: u.id,
  summary: 'COLD SEED — guaranteed lowest heat',
  keywords: ['cold'],
  nVisit: 0,
  lInteraction: 0,
  lastAccessTime: new Date('2020-01-01'),  // very old
});
for (let i = 1; i < SEED_TOTAL; i++) {
  inserts.push({
    userId: u.id,
    summary: `seed segment ${i}`,
    keywords: ['seed', String(i)],
    nVisit: 2 + (i % 5),
    lInteraction: 3 + (i % 7),
    lastAccessTime: new Date(),
  });
}
for (const v of inserts) {
  await db.insert(mtmSegments).values(v);
}

// 4. Pick any segment id to trigger heat-check (mtm-evict only needs userId).
const [anySeg] = await db.select().from(mtmSegments).where(eq(mtmSegments.userId, u.id)).limit(1);
console.log('cold seed id:', COLD_SEGMENT_ID.slice(0, 8));

// 5. Count before.
const [{ count: before }] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(mtmSegments)
  .where(eq(mtmSegments.userId, u.id));
console.log('segments before:', before);

// 6. Enqueue heat-check (will see count > 200 and route to mtm-evict).
await mtmQueues.heatCheck.add('check', { segmentId: anySeg.id, userId: u.id }, {
  jobId: `evict-test-${Date.now()}`,
});
console.log('enqueued heat-check — waiting 12s...');
await new Promise((r) => setTimeout(r, 12000));

// 7. Verify cold seed is gone.
const [{ count: after }] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(mtmSegments)
  .where(eq(mtmSegments.userId, u.id));

const [coldStill] = await db
  .select()
  .from(mtmSegments)
  .where(eq(mtmSegments.id, COLD_SEGMENT_ID))
  .limit(1);

console.log('segments after:', after);
console.log('cold seed still present?', !!coldStill);

process.exit(0);
