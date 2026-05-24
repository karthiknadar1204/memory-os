import { queues } from '../queues';
for (const [name, q] of Object.entries(queues)) {
  await q.clean(0, 10000, 'failed');
  await q.clean(0, 10000, 'completed');
  console.log(`cleared ${name}`);
}
process.exit(0);
