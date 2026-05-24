import { queues } from '../queues';

const failed = await queues.stmMigrate.getJobs(['failed'], 0, 10, false);
console.log(`found ${failed.length} failed stm-migrate jobs`);
for (const j of failed.slice(0, 3)) {
  console.log({
    id: j.id,
    pageId: (j.data as any).pageId?.slice(0, 8),
    attempts: j.attemptsMade,
    failedReason: j.failedReason,
  });
}
process.exit(0);
