import type { Context } from 'hono';
import { chat as openaiChat } from '../utils/openai';
import { insertSTM, identifySTMOverflow } from '../memory/stm';
import { queues } from '../queues';
import { tryAcquireLock, releaseLock, chatLockKey } from '../utils/locks';
import { retrieveAndBuildPrompt } from '../retrieval';

// /chat lock TTL: longer than a slow LLM round-trip but short enough that
// a crashed handler doesn't lock a user out forever.
const CHAT_LOCK_TTL_MS = 30_000;

export async function chat(c: Context) {
  const userId = c.get('userId') as string;
  const { message } = await c.req.json();

  if (!message || typeof message !== 'string') {
    return c.json({ error: 'message (string) is required' }, 400);
  }

  // Acquire per-user mutex so concurrent /chat requests for the same user
  // serialize. Prevents STM/MTM state from being raced.
  const lockKey = chatLockKey(userId);
  const lockToken = await tryAcquireLock({ key: lockKey, ttlMs: CHAT_LOCK_TTL_MS });
  if (!lockToken) {
    return c.json(
      { error: 'A previous chat for this user is still in progress' },
      429,
    );
  }

  try {
    // 1. Retrieve memory across all 3 tiers + build the OpenAI prompt.
    //    (Paper Sec 3.4 + 3.5 — F_Retrieval and Response Generation.)
    const { messages, context } = await retrieveAndBuildPrompt({ userId, message });

    // 2. Call OpenAI with the assembled prompt.
    const response = await openaiChat(messages);

    // 3. Persist this Q&A as a new STM page.
    const newPage = await insertSTM(userId, message, response);

    // 4. Identify overflow (NOT deleted yet — stm-migrate handles deletion).
    const overflowIds = await identifySTMOverflow(userId);

    // 5. Enqueue background work with deterministic jobIds to dedupe.
    await queues.chainSummarize.add(
      'summarize',
      { pageId: newPage.id, userId },
      { jobId: `summarize-${newPage.id}` },
    );

    for (const overflowPageId of overflowIds) {
      await queues.stmMigrate.add(
        'migrate',
        { pageId: overflowPageId, userId },
        { jobId: `migrate-${overflowPageId}` },
      );
    }

    return c.json({
      response,
      pageId: newPage.id,
      stmSize: Math.min(context.stm.length + 1, 7),
      migratingPageIds: overflowIds,
      retrieved: {
        mtmPageCount: context.mtm.pages.length,
        mtmSegmentCount: context.mtm.segmentIds.length,
        lpmKbCount: context.lpm.userKbFacts.length,
        lpmAgentTraitsCount: context.lpm.agentTraitEntries.length,
      },
    });
  } finally {
    await releaseLock(lockKey, lockToken);
  }
}
