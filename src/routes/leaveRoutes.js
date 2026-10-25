import { Router } from 'express';
import {
  apply,
  cancel,
  getLeaves,
  review,
} from '../controllers/leaveController.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Apply & Cancel
router.post('/', verifyToken, apply);
router.post('/:id/cancel', verifyToken, cancel);

// List leaves (scoped inside controller: Employee sees own; HR/Admin see all)
router.get('/', verifyToken, getLeaves);

// Review (Approve/Reject) - HR & Admin
router.put('/:id/review', verifyToken, requireRole('admin', 'hr'), review);

export default router;

