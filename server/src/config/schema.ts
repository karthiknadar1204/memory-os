import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

// ---------- 1. USERS ----------
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ---------- 2. STM PAGES (FIFO 7 per user) ----------
export const stmPages = pgTable(
  'stm_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    query: text('query').notNull(),
    response: text('response').notNull(),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
    chainId: uuid('chain_id'),          // filled by chain-summarize worker
    metaChain: text('meta_chain'),      // filled by chain-summarize worker
  },
  (t) => [
    index('stm_user_time_idx').on(t.userId, t.timestamp),
  ]
);

// ---------- 3. MTM SEGMENTS (max 200 per user, heat-evicted) ----------
export const mtmSegments = pgTable(
  'mtm_segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    summary: text('summary').notNull(),
    keywords: jsonb('keywords').$type<string[]>().notNull(),
    nVisit: integer('n_visit').default(0).notNull(),
    lInteraction: integer('l_interaction').default(0).notNull(),
    lastAccessTime: timestamp('last_access_time').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('mtm_segments_user_idx').on(t.userId),
  ]
);

// ---------- 4. MTM PAGES (pages inside segments) ----------
export const mtmPages = pgTable(
  'mtm_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    segmentId: uuid('segment_id')
      .notNull()
      .references(() => mtmSegments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    query: text('query').notNull(),
    response: text('response').notNull(),
    timestamp: timestamp('timestamp').notNull(),
    metaChain: text('meta_chain'),
    keywords: jsonb('keywords').$type<string[]>().notNull(),
  },
  (t) => [
    index('mtm_pages_segment_idx').on(t.segmentId),
    index('mtm_pages_user_idx').on(t.userId),
  ]
);

// ---------- 5. USER PROFILE (static, 1 row per user) ----------
export const userProfile = pgTable('user_profile', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }),
  gender: varchar('gender', { length: 32 }),
  birthYear: integer('birth_year'),
  extras: jsonb('extras').$type<Record<string, unknown>>(),
});

// ---------- 6. AGENT PROFILE (static, 1 row per user) ----------
export const agentProfile = pgTable('agent_profile', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  character: text('character').notNull(),
  extras: jsonb('extras').$type<Record<string, unknown>>(),
});

// ---------- 7. USER TRAITS (90-dim JSON, 1 row per user) ----------
export const userTraits = pgTable('user_traits', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  traits: jsonb('traits').$type<Record<string, number>>().notNull(),
});

// ---------- 8. USER KB (FIFO 100 per user, also indexed in Pinecone) ----------
export const userKb = pgTable(
  'user_kb',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fact: text('fact').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('user_kb_user_time_idx').on(t.userId, t.createdAt),
  ]
);

// ---------- 9. AGENT TRAITS (FIFO 100 per user, also indexed in Pinecone) ----------
export const agentTraits = pgTable(
  'agent_traits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    trait: text('trait').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('agent_traits_user_time_idx').on(t.userId, t.createdAt),
  ]
);
