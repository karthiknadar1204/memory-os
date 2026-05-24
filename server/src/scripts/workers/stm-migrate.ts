import { startStmMigrateWorker } from '../../workers/mtm/stm-migrate';

const worker = startStmMigrateWorker();
console.log('[stm-migrate] worker running. Ctrl+C to stop.');

async function shutdown() {
  console.log('\n[stm-migrate] shutting down...');
  await worker.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
