import { startSegmentUpdateWorker } from '../../workers/mtm/segment-update';

const worker = startSegmentUpdateWorker();
console.log('[segment-update] worker running. Ctrl+C to stop.');

async function shutdown() {
  console.log('\n[segment-update] shutting down...');
  await worker.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
