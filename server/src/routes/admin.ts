import { Hono } from 'hono';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { HonoAdapter } from '@bull-board/hono';
import { serveStatic } from 'hono/bun';
import { queues } from '../queues';

const BASE_PATH = '/admin/queues';

const serverAdapter = new HonoAdapter(serveStatic);
serverAdapter.setBasePath(BASE_PATH);

createBullBoard({
  queues: Object.values(queues).map((q) => new BullMQAdapter(q)),
  serverAdapter,
});

const router = new Hono();
router.route('/', serverAdapter.registerPlugin());

export default router;
