import { and, eq, sql, asc } from 'drizzle-orm';
import { db } from '../config/db';
import {
  userKb,
  agentTraits,
  userTraits,
  mtmSegments,
} from '../config/schema';

export const USER_KB_CAP       = 100;
export const AGENT_TRAITS_CAP  = 100;
export const TRAIT_VALUE_MIN   = 0;
export const TRAIT_VALUE_MAX   = 1;

export type UserKbRow      = typeof userKb.$inferSelect;
export type AgentTraitsRow = typeof agentTraits.$inferSelect;

// ---------- User KB ----------

// Insert if not already present (text-level dedup). Returns the row, or null if dup.
export async function insertUserKbFact(args: {
  userId: string;
  fact: string;
}): Promise<UserKbRow | null> {
  const fact = args.fact.trim();
  if (!fact) return null;

  // Cheap dedup: skip if exact same fact already exists for this user.
  const [existing] = await db
    .select({ id: userKb.id })
    .from(userKb)
    .where(and(eq(userKb.userId, args.userId), eq(userKb.fact, fact)))
    .limit(1);
  if (existing) return null;

  const [row] = await db
    .insert(userKb)
    .values({ userId: args.userId, fact })
    .returning();
  return row;
}

// Trim user_kb to USER_KB_CAP newest entries. Returns deleted ids (for Pinecone cleanup).
export async function fifoTrimUserKb(userId: string): Promise<string[]> {
  const all = await db
    .select({ id: userKb.id, createdAt: userKb.createdAt })
    .from(userKb)
    .where(eq(userKb.userId, userId))
    .orderBy(asc(userKb.createdAt));

  if (all.length <= USER_KB_CAP) return [];

  const toDelete = all.slice(0, all.length - USER_KB_CAP).map((r) => r.id);
  for (const id of toDelete) {
    await db.delete(userKb).where(eq(userKb.id, id));
  }
  return toDelete;
}

// ---------- Agent Traits ----------

export async function insertAgentTrait(args: {
  userId: string;
  trait: string;
}): Promise<AgentTraitsRow | null> {
  const trait = args.trait.trim();
  if (!trait) return null;

  const [existing] = await db
    .select({ id: agentTraits.id })
    .from(agentTraits)
    .where(and(eq(agentTraits.userId, args.userId), eq(agentTraits.trait, trait)))
    .limit(1);
  if (existing) return null;

  const [row] = await db
    .insert(agentTraits)
    .values({ userId: args.userId, trait })
    .returning();
  return row;
}

export async function fifoTrimAgentTraits(userId: string): Promise<string[]> {
  const all = await db
    .select({ id: agentTraits.id, createdAt: agentTraits.createdAt })
    .from(agentTraits)
    .where(eq(agentTraits.userId, userId))
    .orderBy(asc(agentTraits.createdAt));

  if (all.length <= AGENT_TRAITS_CAP) return [];

  const toDelete = all.slice(0, all.length - AGENT_TRAITS_CAP).map((r) => r.id);
  for (const id of toDelete) {
    await db.delete(agentTraits).where(eq(agentTraits.id, id));
  }
  return toDelete;
}

// ---------- User Traits (90-dim JSON) ----------

export async function getUserTraits(userId: string): Promise<Record<string, number>> {
  const [row] = await db
    .select()
    .from(userTraits)
    .where(eq(userTraits.userId, userId))
    .limit(1);
  return row?.traits ?? {};
}

// Merge LLM-produced deltas into the existing 90-dim JSON.
// Unknown dim names are dropped (we only update keys that already exist).
// Final values are clamped to [TRAIT_VALUE_MIN, TRAIT_VALUE_MAX].
export async function mergeUserTraitDeltas(args: {
  userId: string;
  deltas: Record<string, number>;
}): Promise<{ updatedKeys: string[] }> {
  const current = await getUserTraits(args.userId);
  const updatedKeys: string[] = [];

  for (const [dim, delta] of Object.entries(args.deltas)) {
    if (!(dim in current)) continue;     // ignore dims not in the 90-dim schema
    if (typeof delta !== 'number' || !Number.isFinite(delta)) continue;
    const next = Math.max(
      TRAIT_VALUE_MIN,
      Math.min(TRAIT_VALUE_MAX, current[dim] + delta),
    );
    current[dim] = next;
    updatedKeys.push(dim);
  }

  await db
    .update(userTraits)
    .set({ traits: current })
    .where(eq(userTraits.userId, args.userId));

  return { updatedKeys };
}

// ---------- MTM bridge ----------

// Paper Sec 3.3: after LPM promotion, reset l_interaction = 0 so the segment
// must "earn" promotion again via fresh engagement.
export async function resetSegmentLInteraction(segmentId: string): Promise<void> {
  await db
    .update(mtmSegments)
    .set({ lInteraction: 0 })
    .where(eq(mtmSegments.id, segmentId));
}
