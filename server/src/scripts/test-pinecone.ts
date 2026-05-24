import { ns } from '../utils/pinecone';
import { embed } from '../utils/openai';
import { randomUUID } from 'crypto';

const id = randomUUID();
const vec = await embed('hi test');

console.log('try 1: upsert(array)');
try {
  await ns.mtmSegments().upsert([{ id, values: vec, metadata: { user_id: 'x' } }]);
  console.log('  ✓ array form works');
} catch (e: any) {
  console.log('  ✗ array fails:', e.message);
}

console.log('try 2: upsert({ records })');
try {
  await ns.mtmSegments().upsert({ records: [{ id, values: vec, metadata: { user_id: 'x' } }] } as any);
  console.log('  ✓ object form works');
} catch (e: any) {
  console.log('  ✗ object fails:', e.message);
}

console.log('try 3: upsert(record) — single, not array');
try {
  await ns.mtmSegments().upsert({ id, values: vec, metadata: { user_id: 'x' } } as any);
  console.log('  ✓ single-record form works');
} catch (e: any) {
  console.log('  ✗ single fails:', e.message);
}

// Cleanup
await ns.mtmSegments().deleteOne(id).catch(() => {});
process.exit(0);
