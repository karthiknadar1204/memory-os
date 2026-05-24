import IORedis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// BullMQ requires `maxRetriesPerRequest: null` on the client.
export const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

connection.on('error', (err) => {
  console.error('[redis] connection error:', err.message);
});

connection.on('connect', () => {
  console.log('[redis] connected');
});
