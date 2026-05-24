import { connection as redis } from '../queues/connection';

// Try to acquire a Redis lock with TTL. Returns the lock token if acquired,
// or null if the lock is already held. Use releaseLock(key, token) to free it.
//
// Pattern: Redis SETNX with TTL — atomic, simple, no special libs.
export async function tryAcquireLock(args: {
  key: string;
  ttlMs: number;
}): Promise<string | null> {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // 'NX' = only set if not exists; 'PX' = expire in milliseconds.
  const ok = await redis.set(args.key, token, 'PX', args.ttlMs, 'NX');
  return ok === 'OK' ? token : null;
}

// Safely release: only delete the key if WE still own it (matches our token).
// Done via a tiny Lua script so the check-and-delete is atomic.
const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

export async function releaseLock(key: string, token: string): Promise<void> {
  await redis.eval(RELEASE_SCRIPT, 1, key, token);
}

export function chatLockKey(userId: string): string {
  return `mos:chat-lock:${userId}`;
}
