import { Queue } from 'bullmq';
import { connection } from './connection';

export const LPM_QUEUE_NAMES = {
  LPM_PROMOTE: 'lpm-promote',
} as const;

export type LpmPromoteJob = { segmentId: string; userId: string };

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export const lpmQueues = {
  lpmPromote: new Queue<LpmPromoteJob>(LPM_QUEUE_NAMES.LPM_PROMOTE, {
    connection,
    defaultJobOptions,
  }),
};
