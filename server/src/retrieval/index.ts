import { readSTM } from '../memory/stm';
import { embed } from '../utils/openai';
import { extractKeywords } from '../utils/keywords';
import { retrieveMTM, type MTMRetrievalResult } from './mtm';
import { retrieveLPM, type LPMRetrievalResult } from './lpm';
import { buildPrompt } from './prompt';
import type { ChatMessage } from '../utils/openai';
import type { STMPage } from '../memory/stm';

export type RetrievedContext = {
  stm: STMPage[];
  mtm: MTMRetrievalResult;
  lpm: LPMRetrievalResult;
  queryVector: number[];
  queryKeywords: string[];
};

// Paper Sec 3.4 — F_Retrieval(STM, MTM, LPM | Q):
//   1. Embed the query once.
//   2. Extract query keywords (LLM, used for Jaccard in MTM stage 1).
//   3. Read STM (whole, ≤ 7).
//   4. Two-stage MTM retrieval (top-m=5 segments → top-k=10 pages).
//   5. LPM (profiles + 90-dim traits + top-10 KB + top-10 agent traits).
// Steps 1-2 are sequential prerequisites; steps 3-5 then run in parallel.
export async function retrieveContext(args: {
  userId: string;
  message: string;
}): Promise<RetrievedContext> {
  const { userId, message } = args;

  // 1-2. Prerequisites (sequential — both depend on the message).
  const [queryVector, queryKeywords] = await Promise.all([
    embed(message),
    extractKeywords(message),
  ]);

  // 3-5. Tier retrievals (independent — fan out in parallel).
  const [stm, mtm, lpm] = await Promise.all([
    readSTM(userId),
    retrieveMTM({ userId, queryVector, queryKeywords }),
    retrieveLPM({ userId, queryVector }),
  ]);

  return { stm, mtm, lpm, queryVector, queryKeywords };
}

// Convenience: retrieve + build prompt in one call.
export async function retrieveAndBuildPrompt(args: {
  userId: string;
  message: string;
}): Promise<{ messages: ChatMessage[]; context: RetrievedContext }> {
  const context = await retrieveContext(args);
  const messages = buildPrompt({
    stm: context.stm,
    mtmPages: context.mtm.pages,
    lpm: context.lpm,
    currentMessage: args.message,
  });
  return { messages, context };
}

export { buildPrompt };
