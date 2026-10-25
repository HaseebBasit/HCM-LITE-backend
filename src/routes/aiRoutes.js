import { Router } from 'express';
import { chat, summary } from '../controllers/aiController.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

router.post('/chat', verifyToken, chat);
router.post('/query', verifyToken, chat);
router.post('/summary', verifyToken, requireRole('admin', 'hr'), summary);

export default router;

