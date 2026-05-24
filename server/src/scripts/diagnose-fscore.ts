import { db } from '../config/db';
import { users, mtmSegments, mtmPages } from '../config/schema';
import { eq, desc } from 'drizzle-orm';
import { cosine, jaccard } from '../utils/keywords';

const [u] = await db.select().from(users).orderBy(desc(users.createdAt)).limit(1);
const segs = await db.select().from(mtmSegments).where(eq(mtmSegments.userId, u.id));
console.log('user:', u.email);
console.log(`${segs.length} segments`);

for (const s of segs) {
  const pages = await db.select().from(mtmPages).where(eq(mtmPages.segmentId, s.id));
  console.log(`\nsegment ${s.id.slice(0,8)}:`);
  console.log(`  summary: ${s.summary.slice(0, 120)}`);
  console.log(`  keywords: ${JSON.stringify(s.keywords)}`);
  console.log(`  embedding present: ${!!s.embedding} len=${(s.embedding as any)?.length ?? 0}`);
  console.log(`  pages (${pages.length}):`);
  for (const p of pages) console.log(`    - ${p.query}`);
}

if (segs.length >= 2) {
  console.log('\n=== pairwise F_scores between segment embeddings ===');
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i];
      const b = segs[j];
      const cos = a.embedding && b.embedding ? cosine(a.embedding as number[], b.embedding as number[]) : null;
      const jac = jaccard(a.keywords, b.keywords);
      const f = (cos ?? 0) + jac;
      console.log(`  ${a.id.slice(0,8)} <-> ${b.id.slice(0,8)}  cos=${cos?.toFixed(3) ?? 'n/a'}  jacc=${jac.toFixed(3)}  F=${f.toFixed(3)}  ${f > 0.6 ? '✓ should join' : '✗ below threshold'}`);
    }
  }
}
process.exit(0);
