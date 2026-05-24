import { queues } from '../queues';

for (const [name, q] of Object.entries(queues)) {
  const counts = await q.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed');
  console.log(name.padEnd(20), counts);
}
process.exit(0);
