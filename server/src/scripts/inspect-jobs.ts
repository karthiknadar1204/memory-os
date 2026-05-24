import { queues } from '../queues';

const jobs = await queues.chainSummarize.getJobs(['completed', 'failed'], 0, 20, false);
console.log(`found ${jobs.length} chain-summarize jobs`);
for (const j of jobs.slice(0, 10)) {
  console.log({
    id: j.id,
    pageId: (j.data as any).pageId?.slice(0, 8),
    returnvalue: j.returnvalue,
    failed: j.failedReason,
  });
}
process.exit(0);
