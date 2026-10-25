import { Router } from 'express';
import {
  getAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
} from '../controllers/announcementController.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Everyone can view announcements
router.get('/', verifyToken, getAnnouncements);

// Admin & HR can create announcements
router.post('/', verifyToken, requireRole('admin', 'hr'), createAnnouncement);

// Admin & HR can delete announcements
router.delete('/:id', verifyToken, requireRole('admin', 'hr'), deleteAnnouncement);

export default router;

