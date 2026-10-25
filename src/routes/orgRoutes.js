import { Router } from 'express';
import {
  getDepartments,
  createDepartment,
  deleteDepartment,
  getDesignations,
  createDesignation,
  deleteDesignation,
  getHolidays,
  createHoliday,
  deleteHoliday,
} from '../controllers/orgController.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Departments
router.get('/departments', verifyToken, requireRole('admin', 'hr', 'employee'), getDepartments);
router.post('/departments', verifyToken, requireRole('admin'), createDepartment);
router.delete('/departments/:id', verifyToken, requireRole('admin'), deleteDepartment);

// Designations
router.get('/designations', verifyToken, requireRole('admin', 'hr', 'employee'), getDesignations);
router.post('/designations', verifyToken, requireRole('admin'), createDesignation);
router.delete('/designations/:id', verifyToken, requireRole('admin'), deleteDesignation);

// Holidays
router.get('/holidays', verifyToken, requireRole('admin', 'hr', 'employee'), getHolidays);
router.post('/holidays', verifyToken, requireRole('admin'), createHoliday);
router.delete('/holidays/:id', verifyToken, requireRole('admin'), deleteHoliday);

export default router;

