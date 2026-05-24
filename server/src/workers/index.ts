import type { Worker } from 'bullmq';

// STM workers
import { startChainSummarizeWorker } from './stm/chain-summarize';

// MTM workers
import { startStmMigrateWorker }     from './mtm/stm-migrate';
import { startSegmentUpdateWorker }  from './mtm/segment-update';
import { startHeatCheckWorker }      from './mtm/heat-check';
import { startMtmEvictWorker }       from './mtm/mtm-evict';

// LPM workers
import { startLpmPromoteWorker }     from './lpm/lpm-promote';

// Hot-reload guard: Bun's --hot re-evaluates modules but does NOT close existing
// BullMQ Workers. Without this, every code change spawns a NEW worker on top of
// the OLD one(s) and they race for jobs, causing intermittent bugs.
// We stash the active workers on globalThis so we can close them before re-booting.
declare global {
  // eslint-disable-next-line no-var
  var __memoryosWorkers: Worker[] | undefined;
}

export async function startWorkers(): Promise<Worker[]> {
  // Close any workers from a prior reload.
  if (globalThis.__memoryosWorkers) {
    const old = globalThis.__memoryosWorkers;
    console.log(`[workers] closing ${old.length} stale workers (hot-reload)`);
    await Promise.all(old.map((w) => w.close().catch(() => {})));
  }

  const workers: Worker[] = [
    startChainSummarizeWorker(),
    startStmMigrateWorker(),
    startSegmentUpdateWorker(),
    startHeatCheckWorker(),
    startLpmPromoteWorker(),
    startMtmEvictWorker(),
  ];

  globalThis.__memoryosWorkers = workers;
  console.log(`[workers] booted ${workers.length} workers`);
  return workers;
}
