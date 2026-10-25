import { Router } from 'express';
import {
  generateDraft,
  finalize,
  getPayrollRuns,
  getPayrollByMonth,
  getMyPayslips,
  getSinglePayslip,
} from '../controllers/payrollController.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Draft payroll calculation (HR & Admin)
router.post('/draft', verifyToken, requireRole('admin', 'hr'), generateDraft);

// Finalize and lock payroll permanently (Admin only)
router.post('/finalize', verifyToken, requireRole('admin'), finalize);

// List payroll runs (HR & Admin)
router.get('/', verifyToken, requireRole('admin', 'hr'), getPayrollRuns);

// Employee's own payslips
router.get('/my-payslips', verifyToken, getMyPayslips);

// Single month payroll details (HR & Admin)
router.get('/:month', verifyToken, requireRole('admin', 'hr'), getPayrollByMonth);

// Individual payslip record
router.get('/payslips/:id', verifyToken, getSinglePayslip);

export default router;

