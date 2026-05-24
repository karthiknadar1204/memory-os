import { eq, sql } from 'drizzle-orm';
import { db } from '../config/db';
import {
  userProfile,
  agentProfile,
  userTraits,
  userKb,
  agentTraits,
} from '../config/schema';
import { ns } from '../utils/pinecone';

// Paper Sec 3.4 / 4.1: top-10 each for User KB and Agent Traits.
export const TOP_K_LPM = 10;

export type LPMRetrievalResult = {
  userProfile: typeof userProfile.$inferSelect | null;
  agentProfile: typeof agentProfile.$inferSelect | null;
  userTraits: Record<string, number>;
  userKbFacts: string[];        // top-10 most relevant, hydrated
  agentTraitEntries: string[];  // top-10 most relevant, hydrated
};

// Paper Sec 3.4: load profiles + traits whole, top-10 each on KB / agent-traits.
export async function retrieveLPM(args: {
  userId: string;
  queryVector: number[];
}): Promise<LPMRetrievalResult> {
  const { userId, queryVector } = args;

  // Kick all 5 in parallel.
  const [
    upRow,
    apRow,
    utRow,
    kbHits,
    atHits,
  ] = await Promise.all([
    db.select().from(userProfile).where(eq(userProfile.userId, userId)).limit(1),
    db.select().from(agentProfile).where(eq(agentProfile.userId, userId)).limit(1),
    db.select().from(userTraits).where(eq(userTraits.userId, userId)).limit(1),
    ns.lpmUserKb().query({
      vector: queryVector,
      topK: TOP_K_LPM,
      filter: { user_id: userId },
      includeMetadata: false,
    }),
    ns.lpmAgentTraits().query({
      vector: queryVector,
      topK: TOP_K_LPM,
      filter: { user_id: userId },
      includeMetadata: false,
    }),
  ]);

  // Hydrate KB / agent-traits from Postgres by id, preserve relevance order.
  const kbIds = (kbHits.matches ?? []).map((m) => String(m.id));
  const atIds = (atHits.matches ?? []).map((m) => String(m.id));

  const [kbRows, atRows] = await Promise.all([
    kbIds.length === 0
      ? Promise.resolve([] as { id: string; fact: string }[])
      : db.select({ id: userKb.id, fact: userKb.fact })
          .from(userKb)
          .where(sql`${userKb.id} IN ${kbIds}`),
    atIds.length === 0
      ? Promise.resolve([] as { id: string; trait: string }[])
      : db.select({ id: agentTraits.id, trait: agentTraits.trait })
          .from(agentTraits)
          .where(sql`${agentTraits.id} IN ${atIds}`),
  ]);

  const kbById = new Map(kbRows.map((r) => [r.id, r.fact]));
  const atById = new Map(atRows.map((r) => [r.id, r.trait]));

  const userKbFacts       = kbIds.map((id) => kbById.get(id)).filter(Boolean) as string[];
  const agentTraitEntries = atIds.map((id) => atById.get(id)).filter(Boolean) as string[];

  return {
    userProfile: upRow[0] ?? null,
    agentProfile: apRow[0] ?? null,
    userTraits: utRow[0]?.traits ?? {},
    userKbFacts,
    agentTraitEntries,
  };
}
