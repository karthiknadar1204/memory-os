import { db } from '../config/db';
import { users, mtmSegments } from '../config/schema';
import { eq, desc } from 'drizzle-orm';

const [u] = await db.select().from(users).orderBy(desc(users.createdAt)).limit(1);
console.log('latest user:', u.email);

const segs = await db.select().from(mtmSegments).where(eq(mtmSegments.userId, u.id));
console.log(`\n${segs.length} segments:`);
const now = Date.now();
for (const s of segs) {
  const dt = (now - new Date(s.lastAccessTime).getTime()) / 1000;
  const r = Math.exp(-dt / 1e7);
  const heat = s.nVisit + s.lInteraction + r;
  console.log(`  ${s.id.slice(0,8)}  n_visit=${s.nVisit} l=${s.lInteraction}  heat=${heat.toFixed(3)}`);
}
process.exit(0);
