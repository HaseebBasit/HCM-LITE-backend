import { Router } from 'express';
import {
  getHrUsers,
  createHrUser,
  toggleHrStatus,
  resetHrPassword,
  getEmployees,
  registerEmployee,
  getEmployee360,
  updateEmployee,
  csvDryRun,
  csvCommit,
  csvExport,
} from '../controllers/userController.js';
import { verifyToken, requireRole, requireSelfOrRole } from '../middleware/auth.js';

const router = Router();

// ==================== HR LOGINS (ADMIN ONLY) ====================
router.get('/hr', verifyToken, requireRole('admin'), getHrUsers);
router.post('/hr', verifyToken, requireRole('admin'), createHrUser);
router.put('/hr/:id/status', verifyToken, requireRole('admin'), toggleHrStatus);
router.post('/hr/:id/reset-password', verifyToken, requireRole('admin'), resetHrPassword);

// ==================== CSV OPERATIONS (HR & ADMIN) ====================
router.post('/employees/csv-dryrun', verifyToken, requireRole('admin', 'hr'), csvDryRun);
router.post('/employees/csv-commit', verifyToken, requireRole('admin', 'hr'), csvCommit);
router.get('/employees/csv-export', verifyToken, requireRole('admin', 'hr'), csvExport);

// ==================== EMPLOYEE MANAGEMENT ====================
router.get('/employees', verifyToken, requireRole('admin', 'hr'), getEmployees);
router.post('/employees', verifyToken, requireRole('admin', 'hr'), registerEmployee);
router.get('/employees/:id', verifyToken, requireSelfOrRole('admin', 'hr'), getEmployee360);
router.put('/employees/:id', verifyToken, requireSelfOrRole('admin', 'hr'), updateEmployee);

export default router;

