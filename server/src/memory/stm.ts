import { eq, asc } from 'drizzle-orm';
import { db } from '../config/db';
import { stmPages } from '../config/schema';

export const STM_CAPACITY = 7;

export type STMPage = {
  id: string;
  userId: string;
  query: string;
  response: string;
  timestamp: Date;
  chainId: string | null;
  metaChain: string | null;
};

// Read all current STM pages for a user, oldest-first.
export async function readSTM(userId: string): Promise<STMPage[]> {
  return db
    .select()
    .from(stmPages)
    .where(eq(stmPages.userId, userId))
    .orderBy(asc(stmPages.timestamp))
    .limit(STM_CAPACITY);
}

// Insert a new page and return its row. Caller is responsible for enforcing FIFO.
export async function insertSTM(
  userId: string,
  query: string,
  response: string,
): Promise<STMPage> {
  const [row] = await db
    .insert(stmPages)
    .values({ userId, query, response })
    .returning();
  return row;
}

// Identify STM pages over the FIFO cap. Does NOT delete — the stm-migrate
// worker deletes them after successfully writing the page to MTM. Returns the
// oldest-first list of page ids that should be migrated.
export async function identifySTMOverflow(userId: string): Promise<string[]> {
  const all = await db
    .select({ id: stmPages.id, timestamp: stmPages.timestamp })
    .from(stmPages)
    .where(eq(stmPages.userId, userId))
    .orderBy(asc(stmPages.timestamp));

  if (all.length <= STM_CAPACITY) return [];
  return all.slice(0, all.length - STM_CAPACITY).map((r) => r.id);
}
