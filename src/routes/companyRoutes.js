import { Router } from 'express';
import { getCompany, updateCompany } from '../controllers/companyController.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

// HR and Admin can view company settings
router.get('/', verifyToken, requireRole('admin', 'hr'), getCompany);

// Only Admin can update company settings
router.put('/', verifyToken, requireRole('admin'), updateCompany);

export default router;

