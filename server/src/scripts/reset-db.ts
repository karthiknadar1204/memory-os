import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

const sql = neon(process.env.DATABASE_URL);

console.log('🗑  Dropping all tables and migration tracker...');

// CASCADE handles FK chains.
await sql`DROP TABLE IF EXISTS agent_traits   CASCADE`;
await sql`DROP TABLE IF EXISTS user_kb        CASCADE`;
await sql`DROP TABLE IF EXISTS user_traits    CASCADE`;
await sql`DROP TABLE IF EXISTS agent_profile  CASCADE`;
await sql`DROP TABLE IF EXISTS user_profile   CASCADE`;
await sql`DROP TABLE IF EXISTS mtm_pages      CASCADE`;
await sql`DROP TABLE IF EXISTS mtm_segments   CASCADE`;
await sql`DROP TABLE IF EXISTS stm_pages      CASCADE`;
await sql`DROP TABLE IF EXISTS users          CASCADE`;

// Drizzle's tracking table (in the `drizzle` schema).
await sql`DROP SCHEMA IF EXISTS drizzle       CASCADE`;

console.log('✅ Database is empty. Now run: bun run src/scripts/migrate.ts');
process.exit(0);
