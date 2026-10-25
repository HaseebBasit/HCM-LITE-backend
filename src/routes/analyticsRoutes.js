import { Router } from 'express';
import {
  getAdminAnalytics,
  getHrAnalytics,
  getEmployeeAnalytics,
  getHeadcount,
  getLateComersReport,
  getLeaveSummaryReport,
} from '../controllers/analyticsController.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/admin', verifyToken, requireRole('admin'), getAdminAnalytics);
router.get('/hr', verifyToken, requireRole('admin', 'hr'), getHrAnalytics);
router.get('/employee', verifyToken, getEmployeeAnalytics);

router.get('/headcount', verifyToken, requireRole('admin', 'hr'), getHeadcount);
router.get('/late-comers', verifyToken, requireRole('admin', 'hr'), getLateComersReport);
router.get('/leave-summary', verifyToken, requireRole('admin', 'hr'), getLeaveSummaryReport);

export default router;

