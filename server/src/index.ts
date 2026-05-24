import { Hono } from 'hono';
import { logger } from 'hono/logger';
import auth from './routes/auth';
import chat from './routes/chat';
import memory from './routes/memory';
import { startWorkers } from './workers';

const app = new Hono();
app.use(logger());

app.get('/', (c) => c.text('MemoryOS server'));

app.route('/auth', auth);
app.route('/chat', chat);
app.route('/memory', memory);

// Boot all 6 background workers (in-process for now).
startWorkers();

export default {
  port: 3004,
  fetch: app.fetch,
};

