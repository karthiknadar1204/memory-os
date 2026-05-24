// Tier-grouped queue exports.
export { stmQueues, STM_QUEUE_NAMES, type ChainSummarizeJob } from './stm';
export { mtmQueues, MTM_QUEUE_NAMES, type StmMigrateJob, type SegmentUpdateJob, type HeatCheckJob, type MtmEvictJob } from './mtm';
export { lpmQueues, LPM_QUEUE_NAMES, type LpmPromoteJob } from './lpm';

import { stmQueues } from './stm';
import { mtmQueues } from './mtm';
import { lpmQueues } from './lpm';

// Flat convenience object for producers — pick from any tier without nesting.
// Example: `queues.chainSummarize.add(...)`.
export const queues = {
  ...stmQueues,
  ...mtmQueues,
  ...lpmQueues,
};

// Centralized list of every queue name (e.g., for admin dashboards).
export const QUEUE_NAMES = {
  CHAIN_SUMMARIZE: 'chain-summarize',
  STM_MIGRATE:     'stm-migrate',
  SEGMENT_UPDATE:  'segment-update',
  HEAT_CHECK:      'heat-check',
  MTM_EVICT:       'mtm-evict',
  LPM_PROMOTE:     'lpm-promote',
} as const;
