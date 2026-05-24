import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../config/db';
import {
  mtmSegments,
  userProfile,
  agentProfile,
  userTraits,
  userKb,
  agentTraits,
} from '../config/schema';
import { readSTM } from '../memory/stm';

// GET /memory/stm — current STM pages for the authed user.
export async function getSTM(c: Context) {
  const userId = c.get('userId') as string;
  const stm = await readSTM(userId);
  return c.json({ userId, count: stm.length, stm });
}

// GET /memory/mtm — segments + heat snapshot (pages omitted for brevity).
export async function getMTM(c: Context) {
  const userId = c.get('userId') as string;
  const segments = await db
    .select()
    .from(mtmSegments)
    .where(eq(mtmSegments.userId, userId));

  // Heat is derived, not stored.
  const now = Date.now();
  const enriched = segments.map((s) => {
    const dt = (now - new Date(s.lastAccessTime).getTime()) / 1000;
    const rRecency = Math.exp(-dt / 1e7);
    const heat = s.nVisit + s.lInteraction + rRecency;
    return { ...s, heat: Number(heat.toFixed(4)) };
  });

  return c.json({
    userId,
    segmentCount: enriched.length,
    segments: enriched,
  });
}

// GET /memory/lpm — full LPM snapshot for the authed user.
export async function getLPM(c: Context) {
  const userId = c.get('userId') as string;
  const [profile] = await db.select().from(userProfile).where(eq(userProfile.userId, userId));
  const [agent]   = await db.select().from(agentProfile).where(eq(agentProfile.userId, userId));
  const [traits]  = await db.select().from(userTraits).where(eq(userTraits.userId, userId));
  const kb        = await db.select().from(userKb).where(eq(userKb.userId, userId));
  const at        = await db.select().from(agentTraits).where(eq(agentTraits.userId, userId));

  return c.json({
    userId,
    userProfile: profile ?? null,
    agentProfile: agent ?? null,
    userTraits: traits?.traits ?? null,
    userKbCount: kb.length,
    userKb: kb,
    agentTraitsCount: at.length,
    agentTraits: at,
  });
}
