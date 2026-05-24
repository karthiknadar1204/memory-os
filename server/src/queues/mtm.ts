import { Queue } from 'bullmq';
import { connection } from './connection';

export const MTM_QUEUE_NAMES = {
  STM_MIGRATE:    'stm-migrate',
  SEGMENT_UPDATE: 'segment-update',
  HEAT_CHECK:     'heat-check',
  MTM_EVICT:      'mtm-evict',
} as const;

export type StmMigrateJob    = { pageId: string; userId: string };
export type SegmentUpdateJob = { segmentId: string; userId: string };
export type HeatCheckJob     = { segmentId: string; userId: string };
export type MtmEvictJob      = { userId: string };

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export const mtmQueues = {
  stmMigrate: new Queue<StmMigrateJob>(MTM_QUEUE_NAMES.STM_MIGRATE, {
    connection,
    defaultJobOptions,
  }),
  segmentUpdate: new Queue<SegmentUpdateJob>(MTM_QUEUE_NAMES.SEGMENT_UPDATE, {
    connection,
    defaultJobOptions,
  }),
  heatCheck: new Queue<HeatCheckJob>(MTM_QUEUE_NAMES.HEAT_CHECK, {
    connection,
    defaultJobOptions,
  }),
  mtmEvict: new Queue<MtmEvictJob>(MTM_QUEUE_NAMES.MTM_EVICT, {
    connection,
    defaultJobOptions,
  }),
};
