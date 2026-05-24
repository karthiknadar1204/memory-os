import { startMtmEvictWorker } from '../../workers/mtm/mtm-evict';

const worker = startMtmEvictWorker();
console.log('[mtm-evict] worker running. Ctrl+C to stop.');

async function shutdown() {
  console.log('\n[mtm-evict] shutting down...');
  await worker.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
