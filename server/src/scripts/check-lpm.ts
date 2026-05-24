import { db } from '../config/db';
import { users, userProfile, agentProfile, userTraits } from '../config/schema';
import { desc, eq } from 'drizzle-orm';

const [latest] = await db.select().from(users).orderBy(desc(users.createdAt)).limit(1);
console.log('Newest user:', latest.id, latest.email);

const [up] = await db.select().from(userProfile).where(eq(userProfile.userId, latest.id));
const [ap] = await db.select().from(agentProfile).where(eq(agentProfile.userId, latest.id));
const [ut] = await db.select().from(userTraits).where(eq(userTraits.userId, latest.id));

console.log('user_profile row exists:', !!up);
console.log('agent_profile:', { role: ap?.role, character: ap?.character });
console.log('user_traits dim count:', Object.keys(ut?.traits ?? {}).length);
console.log('first 5 dims:', Object.entries(ut?.traits ?? {}).slice(0, 5));
process.exit(0);
