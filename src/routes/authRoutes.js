import { Router } from 'express';
import {
  getSetupStatus,
  firstRunSetup,
  login,
  register,
  changePassword,
  getMe,
} from '../controllers/authController.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Public routes
router.get('/setup-status', getSetupStatus);
router.get('/status', getSetupStatus); // Alias
router.post('/setup', firstRunSetup);
router.post('/login', login);
router.post('/register', verifyToken, requireRole('admin', 'hr'), register);
router.post('/signup', verifyToken, requireRole('admin', 'hr'), register);

// Authenticated routes
router.get('/me', verifyToken, getMe);
router.post('/change-password', verifyToken, changePassword);

export default router;
