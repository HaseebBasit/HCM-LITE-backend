import { Router } from 'express';
import { getAuditLogs } from '../controllers/auditController.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Only Admin can view Audit Logs
router.get('/', verifyToken, requireRole('admin'), getAuditLogs);

export default router;

