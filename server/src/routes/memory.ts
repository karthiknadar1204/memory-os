import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { getSTM, getMTM, getLPM } from '../controllers/memory';

const router = new Hono();

router.use('*', requireAuth);
router.get('/stm', getSTM);
router.get('/mtm', getMTM);
router.get('/lpm', getLPM);

export default router;
