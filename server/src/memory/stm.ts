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

// Enforce FIFO: if user has > STM_CAPACITY rows, delete the oldest excess.
// Returns the ids deleted (so callers can later enqueue stm-migrate for them).
export async function enforceSTMLimit(userId: string): Promise<string[]> {
  const all = await db
    .select({ id: stmPages.id, timestamp: stmPages.timestamp })
    .from(stmPages)
    .where(eq(stmPages.userId, userId))
    .orderBy(asc(stmPages.timestamp));

  if (all.length <= STM_CAPACITY) return [];

  const excess = all.slice(0, all.length - STM_CAPACITY);
  const idsToDelete = excess.map((r) => r.id);

  for (const id of idsToDelete) {
    await db.delete(stmPages).where(eq(stmPages.id, id));
  }

  return idsToDelete;
}
