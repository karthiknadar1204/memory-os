import { Queue } from 'bullmq';
import { connection } from './connection';

export const STM_QUEUE_NAMES = {
  CHAIN_SUMMARIZE: 'chain-summarize',
} as const;

export type ChainSummarizeJob = { pageId: string; userId: string };

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export const stmQueues = {
  chainSummarize: new Queue<ChainSummarizeJob>(STM_QUEUE_NAMES.CHAIN_SUMMARIZE, {
    connection,
    defaultJobOptions,
  }),
};
