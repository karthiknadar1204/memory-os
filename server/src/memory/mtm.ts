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
}): Promise<MTMSegment> {
  const [row] = await db
    .insert(mtmSegments)
    .values({
      userId: args.userId,
      summary: args.summary,
      keywords: args.keywords,
      lInteraction: 1,           // we always insert with the first page in mind
      nVisit: 0,
      lastAccessTime: new Date(),
    })
    .returning();
  return row;
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

// ---------- Pages ----------

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
