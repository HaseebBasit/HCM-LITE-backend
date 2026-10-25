import { Router } from 'express';
import {
  checkIn,
  checkOut,
  getTodayAttendance,
  getAttendanceCalendar,
  submitCorrectionRequest,
  getCorrectionRequests,
  reviewCorrectionRequest,
} from '../controllers/attendanceController.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Check-in & Check-out
router.post('/check-in', verifyToken, checkIn);
router.post('/checkin', verifyToken, checkIn);
router.post('/check-out', verifyToken, checkOut);
router.post('/checkout', verifyToken, checkOut);
router.get('/today', verifyToken, getTodayAttendance);

// Calendar & Records
router.get('/calendar', verifyToken, getAttendanceCalendar);

// Corrections
router.post('/corrections', verifyToken, submitCorrectionRequest);
router.get('/corrections', verifyToken, getCorrectionRequests);
router.put('/corrections/:id/review', verifyToken, requireRole('admin', 'hr'), reviewCorrectionRequest);

export default router;

