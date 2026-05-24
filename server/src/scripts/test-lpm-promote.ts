import { db } from '../config/db';
import { users, mtmSegments, userKb, agentTraits, userTraits } from '../config/schema';
import { eq, desc } from 'drizzle-orm';
import { mtmQueues } from '../queues/mtm';

// 1. Latest user.
const [u] = await db.select().from(users).orderBy(desc(users.createdAt)).limit(1);
console.log('user:', u.email);

// 2. Find their first segment.
const [seg] = await db.select().from(mtmSegments).where(eq(mtmSegments.userId, u.id)).limit(1);
if (!seg) {
  console.error('no segments — send some chat messages first');
  process.exit(1);
}
console.log('target segment:', seg.id.slice(0, 8), `l_interaction=${seg.lInteraction}`);

// 3. Bump l_interaction so heat exceeds 5.
await db.update(mtmSegments).set({ lInteraction: 8 }).where(eq(mtmSegments.id, seg.id));
console.log('bumped l_interaction to 8 (heat ≈ 9)');

// 4. Baseline LPM counts.
const kbBefore = (await db.select().from(userKb).where(eq(userKb.userId, u.id))).length;
const atBefore = (await db.select().from(agentTraits).where(eq(agentTraits.userId, u.id))).length;
const [traitsRowBefore] = await db.select().from(userTraits).where(eq(userTraits.userId, u.id));
const traitsBefore = traitsRowBefore?.traits ?? {};
const nonZeroBefore = Object.values(traitsBefore).filter((v: any) => v !== 0).length;
console.log('LPM before:', { kb: kbBefore, agent_traits: atBefore, nonZeroTraits: nonZeroBefore });

// 5. Trigger heat-check (which will route to lpm-promote).
await mtmQueues.heatCheck.add('check', { segmentId: seg.id, userId: u.id }, {
  jobId: `heat-check-test-${Date.now()}`,
});
console.log('enqueued heat-check — waiting 25s for full chain...');

await new Promise((r) => setTimeout(r, 25000));

// 6. Check LPM after.
const kbAfter = await db.select().from(userKb).where(eq(userKb.userId, u.id));
const atAfter = await db.select().from(agentTraits).where(eq(agentTraits.userId, u.id));
const [traitsRowAfter] = await db.select().from(userTraits).where(eq(userTraits.userId, u.id));
const traitsAfter = traitsRowAfter?.traits ?? {};
const nonZeroAfter = Object.entries(traitsAfter).filter(([, v]: any) => v !== 0);

const [segAfter] = await db.select().from(mtmSegments).where(eq(mtmSegments.id, seg.id));

console.log('\n=== LPM after ===');
console.log('user_kb count:', kbAfter.length);
for (const r of kbAfter) console.log('  -', r.fact);
console.log('agent_traits count:', atAfter.length);
for (const r of atAfter) console.log('  -', r.trait);
console.log('non-zero trait dims:', nonZeroAfter.length);
for (const [k, v] of nonZeroAfter) console.log(`  ${k}: ${v}`);

console.log('\n=== Segment after ===');
console.log(`segment.l_interaction reset to: ${segAfter.lInteraction}  (was 8)`);

process.exit(0);
