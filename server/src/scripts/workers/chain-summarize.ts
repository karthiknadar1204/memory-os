import { startChainSummarizeWorker } from '../../workers/stm/chain-summarize';

const worker = startChainSummarizeWorker();
console.log('[chain-summarize] worker running. Ctrl+C to stop.');

async function shutdown() {
  console.log('\n[chain-summarize] shutting down...');
  await worker.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
