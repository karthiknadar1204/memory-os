import { ensureIndex } from '../utils/pinecone';

console.log('⏳ Ensuring Pinecone index exists...');
await ensureIndex({ cloud: 'aws', region: 'us-east-1' });
console.log('✅ Done.');
process.exit(0);
