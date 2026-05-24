import { eq, sql } from 'drizzle-orm';
import { db } from '../config/db';
import { mtmSegments, mtmPages } from '../config/schema';

export const MTM_SEGMENT_CAP = 200;

export type MTMSegment = typeof mtmSegments.$inferSelect;
export type MTMPage    = typeof mtmPages.$inferSelect;

// ---------- Segments ----------

export async function listSegmentsByIds(ids: string[]): Promise<MTMSegment[]> {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(mtmSegments)
    .where(sql`${mtmSegments.id} IN ${ids}`);
}

export async function countUserSegments(userId: string): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(mtmSegments)
    .where(eq(mtmSegments.userId, userId));
  return row?.c ?? 0;
}

export async function insertSegment(args: {
  userId: string;
  summary: string;
  keywords: string[];
  embedding: number[];
}): Promise<MTMSegment> {
  const [row] = await db
    .insert(mtmSegments)
    .values({
      userId: args.userId,
      summary: args.summary,
      keywords: args.keywords,
      embedding: args.embedding,
      lInteraction: 1,           // we always insert with the first page in mind
      nVisit: 0,
      lastAccessTime: new Date(),
    })
    .returning();
  return row;
}

// List ALL segments for a user with their embeddings — used by stm-migrate
// to do strongly-consistent F_score matching against Postgres state.
export async function listSegmentsForMatching(userId: string): Promise<
  Array<{ id: string; keywords: string[]; embedding: number[] | null }>
> {
  return db
    .select({
      id: mtmSegments.id,
      keywords: mtmSegments.keywords,
      embedding: mtmSegments.embedding,
    })
    .from(mtmSegments)
    .where(eq(mtmSegments.userId, userId));
}

// Increment l_interaction (called when a new page joins) and refresh last_access_time.
export async function bumpSegmentOnJoin(segmentId: string): Promise<void> {
  await db
    .update(mtmSegments)
    .set({
      lInteraction: sql`${mtmSegments.lInteraction} + 1`,
      lastAccessTime: new Date(),
    })
    .where(eq(mtmSegments.id, segmentId));
}

// Paper Sec 3.4 — after retrieval, bump n_visit + R_recency for retrieved segments.
// We update many segments in a single SQL statement to avoid per-row roundtrips.
export async function bumpSegmentsOnRetrieval(segmentIds: string[]): Promise<void> {
  if (segmentIds.length === 0) return;
  await db
    .update(mtmSegments)
    .set({
      nVisit: sql`${mtmSegments.nVisit} + 1`,
      lastAccessTime: new Date(),
    })
    .where(sql`${mtmSegments.id} IN ${segmentIds}`);
}

export async function listPagesByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(mtmPages)
    .where(sql`${mtmPages.id} IN ${ids}`);
}

// Find the lowest-heat segment for a user (paper Sec 3.3: heat-based eviction).
// Heat is computed on read via the same formula used in the heat-check worker:
//   heat = n_visit + l_interaction + exp(-Δt / μ)   (μ = 1e+7 sec)
export async function findColdestSegment(userId: string): Promise<MTMSegment | null> {
  // Compute heat directly in SQL so we can ORDER BY it.
  const rows = await db.execute(sql`
    SELECT id, n_visit, l_interaction, last_access_time,
           n_visit + l_interaction
             + EXP(EXTRACT(EPOCH FROM (last_access_time - NOW())) / 1e7) AS heat
    FROM mtm_segments
    WHERE user_id = ${userId}
    ORDER BY heat ASC
    LIMIT 1
  `);
  const row: any = (rows as any).rows?.[0] ?? (rows as any)[0];
  if (!row) return null;
  return getSegmentById(row.id);
}

// Delete a segment. FK ON DELETE CASCADE on mtm_pages.segment_id handles pages.
export async function deleteSegment(segmentId: string): Promise<void> {
  await db.delete(mtmSegments).where(eq(mtmSegments.id, segmentId));
}

export async function getSegmentById(segmentId: string): Promise<MTMSegment | null> {
  const [row] = await db
    .select()
    .from(mtmSegments)
    .where(eq(mtmSegments.id, segmentId))
    .limit(1);
  return row ?? null;
}

export async function updateSegmentSummary(args: {
  segmentId: string;
  summary: string;
  keywords: string[];
  embedding: number[];
}): Promise<void> {
  await db
    .update(mtmSegments)
    .set({
      summary: args.summary,
      keywords: args.keywords,
      embedding: args.embedding,
    })
    .where(eq(mtmSegments.id, args.segmentId));
}

// ---------- Pages ----------

export async function listPagesBySegment(segmentId: string): Promise<MTMPage[]> {
  return db
    .select()
    .from(mtmPages)
    .where(eq(mtmPages.segmentId, segmentId));
}

export async function insertMTMPage(args: {
  segmentId: string;
  userId: string;
  query: string;
  response: string;
  timestamp: Date;
  metaChain: string | null;
  keywords: string[];
}): Promise<MTMPage> {
  const [row] = await db
    .insert(mtmPages)
    .values({
      segmentId: args.segmentId,
      userId: args.userId,
      query: args.query,
      response: args.response,
      timestamp: args.timestamp,
      metaChain: args.metaChain,
      keywords: args.keywords,
    })
    .returning();
  return row;
}
