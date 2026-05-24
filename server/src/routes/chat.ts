import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { chat } from '../controllers/chat';

const router = new Hono();

router.use('*', requireAuth);
router.post('/', chat);

export default router;
