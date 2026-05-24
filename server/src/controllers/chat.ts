import type { Context } from 'hono';
import { chat as openaiChat, type ChatMessage } from '../utils/openai';
import { readSTM, insertSTM, identifySTMOverflow } from '../memory/stm';
import { queues } from '../queues';
import { tryAcquireLock, releaseLock, chatLockKey } from '../utils/locks';

// /chat lock TTL: longer than a slow LLM round-trip but short enough that
// a crashed handler doesn't lock a user out forever.
const CHAT_LOCK_TTL_MS = 30_000;

export async function chat(c: Context) {
  const userId = c.get('userId') as string;
  const { message } = await c.req.json();

  if (!message || typeof message !== 'string') {
    return c.json({ error: 'message (string) is required' }, 400);
  }

  // Acquire per-user mutex so concurrent /chat requests from the same user
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
  // 1. Read STM (last up to 7 Q&A turns, oldest-first).
  const stm = await readSTM(userId);

  // 2. Build the OpenAI message list: system prompt + prior turns + current query.
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a helpful AI assistant with persistent memory across the conversation.',
    },
  ];
  for (const page of stm) {
    messages.push({ role: 'user', content: page.query });
    messages.push({ role: 'assistant', content: page.response });
  }
  messages.push({ role: 'user', content: message });

  // 3. Call OpenAI.
  const response = await openaiChat(messages);

  // 4. Persist this Q&A as a new STM page.
  const newPage = await insertSTM(userId, message, response);

  // 5. Identify overflow (NOT deleted yet — the stm-migrate worker deletes after migration).
  const overflowIds = await identifySTMOverflow(userId);

  // 6. Enqueue background work with deterministic jobIds so duplicates dedupe.
  //    - chain-summarize: always fires for the new page.
  //    - stm-migrate: one per overflow page id. Same pageId enqueued twice
  //      (because overflow hasn't been deleted yet) is auto-deduped by jobId.
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
    stmSize: Math.min(stm.length + 1, 7),
    migratingPageIds: overflowIds,
  });
  } finally {
    await releaseLock(lockKey, lockToken);
  }
}
