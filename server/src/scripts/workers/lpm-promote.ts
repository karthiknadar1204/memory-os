import { startLpmPromoteWorker } from '../../workers/lpm/lpm-promote';

const worker = startLpmPromoteWorker();
console.log('[lpm-promote] worker running. Ctrl+C to stop.');

async function shutdown() {
  console.log('\n[lpm-promote] shutting down...');
  await worker.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
