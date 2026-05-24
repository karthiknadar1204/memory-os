import { startHeatCheckWorker } from '../../workers/mtm/heat-check';

const worker = startHeatCheckWorker();
console.log('[heat-check] worker running. Ctrl+C to stop.');

async function shutdown() {
  console.log('\n[heat-check] shutting down...');
  await worker.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
