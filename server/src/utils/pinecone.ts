import { Pinecone, type RecordMetadata } from '@pinecone-database/pinecone';
import * as dotenv from 'dotenv';

dotenv.config();

if (!process.env.PINECONE_API_KEY) {
  throw new Error('PINECONE_API_KEY is not set');
}

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const INDEX_NAME = process.env.PINECONE_INDEX || 'memoryos';

// One index for everything. Logical separation via namespaces.
// Pass the generic to select the non-deprecated overload in v7+.
export const index = pc.index<RecordMetadata>(INDEX_NAME);

// ---------- Namespaces (the 4 logical collections) ----------

export const NAMESPACES = {
  MTM_SEGMENTS: 'mtm-segments',
  MTM_PAGES: 'mtm-pages',
  LPM_USER_KB: 'lpm-user-kb',
  LPM_AGENT_TRAITS: 'lpm-agent-traits',
} as const;

export const ns = {
  mtmSegments: () => index.namespace(NAMESPACES.MTM_SEGMENTS),
  mtmPages: () => index.namespace(NAMESPACES.MTM_PAGES),
  lpmUserKb: () => index.namespace(NAMESPACES.LPM_USER_KB),
  lpmAgentTraits: () => index.namespace(NAMESPACES.LPM_AGENT_TRAITS),
};

// ---------- Metadata types (typed at write/read sites) ----------

export type MTMSegmentMeta = {
  user_id: string;
  keywords: string[];
};

export type MTMPageMeta = {
  user_id: string;
  segment_id: string;
};

export type LPMEntryMeta = {
  user_id: string;
};

// ---------- One-time index bootstrap ----------
// Call this once (e.g., from a `bun run` script) before using the namespaces.
// Pinecone serverless requires you to pick cloud + region.

export async function ensureIndex(opts: {
  cloud?: 'aws' | 'gcp' | 'azure';
  region?: string;
} = {}) {
  const existing = await pc.listIndexes();
  const found = existing.indexes?.some((i) => i.name === INDEX_NAME);
  if (found) {
    console.log(`✓ index "${INDEX_NAME}" already exists`);
    return;
  }

  await pc.createIndex({
    name: INDEX_NAME,
    dimension: 1536,           // text-embedding-3-small
    metric: 'cosine',
    spec: {
      serverless: {
        cloud: opts.cloud ?? 'aws',
        region: opts.region ?? 'us-east-1',
      },
    },
  });

  console.log(`✓ created index "${INDEX_NAME}"`);
}
