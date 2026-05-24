import type { Context } from 'hono';
import { chat as openaiChat, type ChatMessage } from '../utils/openai';
import { readSTM, insertSTM, enforceSTMLimit } from '../memory/stm';
import { queues } from '../queues';

export async function chat(c: Context) {
  const userId = c.get('userId') as string;
  const { message } = await c.req.json();

  if (!message || typeof message !== 'string') {
    return c.json({ error: 'message (string) is required' }, 400);
  }

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

  // 4. Persist this Q&A as a new STM page, then enforce FIFO.
  const newPage = await insertSTM(userId, message, response);
  const evicted = await enforceSTMLimit(userId);

  // 5. Enqueue background work.
  //    - chain-summarize: always fires for the new page.
  //    - stm-migrate: TODO — will be enqueued for each evicted page in a later phase.
  await queues.chainSummarize.add('summarize', {
    pageId: newPage.id,
    userId,
  });

  return c.json({
    response,
    pageId: newPage.id,
    stmSize: Math.min(stm.length + 1, 7),
    evictedPageIds: evicted,
  });
}

