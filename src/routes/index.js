import { Router } from 'express';
import authRoutes from './authRoutes.js';
import companyRoutes from './companyRoutes.js';
import orgRoutes from './orgRoutes.js';
import userRoutes from './userRoutes.js';
import attendanceRoutes from './attendanceRoutes.js';
import leaveRoutes from './leaveRoutes.js';
import payrollRoutes from './payrollRoutes.js';
import analyticsRoutes from './analyticsRoutes.js';
import aiRoutes from './aiRoutes.js';
import announcementRoutes from './announcementRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import auditRoutes from './auditRoutes.js';
import { getSetupStatus, firstRunSetup, login, register } from '../controllers/authController.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const apiRouter = Router();

// Direct aliases requested in specification
apiRouter.get('/status', getSetupStatus);
apiRouter.post('/setup/first-run', firstRunSetup);
apiRouter.post('/setup', firstRunSetup);
apiRouter.post('/login', login);
apiRouter.post('/register', verifyToken, requireRole('admin', 'hr'), register);
apiRouter.post('/signup', verifyToken, requireRole('admin', 'hr'), register);

// Standard modular routes
apiRouter.use('/auth', authRoutes);
apiRouter.use('/company', companyRoutes);
apiRouter.use('/org', orgRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/attendance', attendanceRoutes);
apiRouter.use('/leaves', leaveRoutes);
apiRouter.use('/payroll', payrollRoutes);
apiRouter.use('/analytics', analyticsRoutes);
apiRouter.use('/ai', aiRoutes);
apiRouter.use('/announcements', announcementRoutes);
apiRouter.use('/notifications', notificationRoutes);
apiRouter.use('/audit', auditRoutes);

export default apiRouter;
