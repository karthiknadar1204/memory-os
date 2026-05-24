import type { Context, Next } from 'hono';
import { verify } from 'hono/jwt';

const JWT_SECRET = process.env.JWT_SECRET as string;

export async function requireAuth(c: Context, next: Next) {
  const header = c.req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }
  const token = header.slice('Bearer '.length).trim();

  try {
    const payload = await verify(token, JWT_SECRET, 'HS256');
    if (!payload.sub || typeof payload.sub !== 'string') {
      return c.json({ error: 'Invalid token payload' }, 401);
    }
    c.set('userId', payload.sub);
    c.set('jwt', payload);
    await next();
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}
