import { Attendance } from '../models/Attendance.js';
import { User } from '../models/User.js';
import {
  checkInEmployee,
  checkOutEmployee,
  requestCorrection,
  reviewCorrection,
} from '../services/attendanceService.js';
import { logAudit } from '../services/auditService.js';
import { createNotification } from '../services/notificationService.js';
import { formatDateString } from '../utils/dateUtils.js';

export const checkIn = async (req, res, next) => {
  try {
    const { faceVerified, facePhotoUrl } = req.body;

    const record = await checkInEmployee({
      userId: req.user._id,
      faceVerified,
      facePhotoUrl,
    });

    await logAudit({
      req,
      action: 'ATTENDANCE_CHECKIN',
      entity: 'Attendance',
      entityId: record._id,
      after: {
        date: record.date,
        checkIn: record.checkIn,
        status: record.status,
        faceVerified: record.faceVerified,
      },
    });

    return res.status(201).json({
      success: true,
      message: `Checked in successfully as ${record.status.toUpperCase()}.`,
      attendance: record,
    });
  } catch (error) {
    next(error);
  }
};

export const checkOut = async (req, res, next) => {
  try {
    const record = await checkOutEmployee({ userId: req.user._id });

    await logAudit({
      req,
      action: 'ATTENDANCE_CHECKOUT',
      entity: 'Attendance',
      entityId: record._id,
      after: {
        checkOut: record.checkOut,
        workHours: record.workHours,
        status: record.status,
      },
    });

    return res.status(200).json({
      success: true,
      message: `Checked out successfully. Logged ${record.workHours} hours (${record.status.toUpperCase()}).`,
      attendance: record,
    });
  } catch (error) {
    next(error);
  }
};

export const getTodayAttendance = async (req, res, next) => {
  try {
    const today = formatDateString(new Date());
    const record = await Attendance.findOne({ userId: req.user._id, date: today });

    return res.status(200).json({
      success: true,
      date: today,
      attendance: record || null,
      isCheckedIn: Boolean(record?.checkIn),
      isCheckedOut: Boolean(record?.checkOut),
    });
  } catch (error) {
    next(error);
  }
};

export const getAttendanceCalendar = async (req, res, next) => {
  try {
    const { month, userId, startDate, endDate } = req.query;

    const query = {};

    // Scoping: Employee can only see own records
    if (String(req.user.role || '').toLowerCase() === 'employee') {
      query.userId = req.user._id;
    } else if (userId) {
      query.userId = userId;
    }

    if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) {
      query.date = { $regex: new RegExp(`^${month}`) };
    } else if (startDate && endDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(endDate)) || startDate > endDate) {
        return res.status(422).json({ success: false, message: 'Provide a valid date range in YYYY-MM-DD format.' });
      }
      query.date = { $gte: startDate, $lte: endDate };
    } else if (month) {
      return res.status(422).json({ success: false, message: 'Month must use YYYY-MM format.' });
    } else {
      return res.status(422).json({ success: false, message: 'Choose a month or date range to load attendance.' });
    }

    const records = await Attendance.find(query)
      .populate('userId', 'name employeeId department')
      .sort({ date: -1 })
      .limit(5000);

    return res.status(200).json({
      success: true,
      total: records.length,
      records,
    });
  } catch (error) {
    next(error);
  }
};

export const submitCorrectionRequest = async (req, res, next) => {
  try {
    const { date, requestedCheckIn, requestedCheckOut, reason } = req.body;

    if (!date || !requestedCheckIn || !reason) {
      return res.status(422).json({
        success: false,
        message: 'Date, requested check-in time, and reason are required.',
      });
    }

    const record = await requestCorrection({
      userId: req.user._id,
      date,
      requestedCheckIn,
      requestedCheckOut,
      reason,
    });

    await logAudit({
      req,
      action: 'REQUEST_ATTENDANCE_CORRECTION',
      entity: 'Attendance',
      entityId: record._id,
      after: record.correctionRequest,
    });

    return res.status(200).json({
      success: true,
      message: 'Correction request submitted to HR for approval.',
      attendance: record,
    });
  } catch (error) {
    next(error);
  }
};

export const getCorrectionRequests = async (req, res, next) => {
  try {
    const query = { 'correctionRequest.hasRequest': true };

    if (String(req.user.role || '').toLowerCase() === 'employee') {
      query.userId = req.user._id;
    }

    const records = await Attendance.find(query)
      .populate('userId', 'name employeeId department')
      .populate('correctionRequest.reviewedBy', 'name email')
      .sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      requests: records,
    });
  } catch (error) {
    next(error);
  }
};

export const reviewCorrectionRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { decision, reviewComment } = req.body;

    const record = await reviewCorrection({
      attendanceId: id,
      reviewerId: req.user._id,
      decision,
      reviewComment,
    });

    await logAudit({
      req,
      action: `REVIEW_CORRECTION_${decision.toUpperCase()}`,
      entity: 'Attendance',
      entityId: record._id,
      after: { decision, reviewComment },
    });

    await createNotification({
      userId: record.userId,
      title: `Attendance Correction ${decision === 'approved' ? 'Approved' : 'Rejected'}`,
      message: `Your attendance correction request for date ${record.date} was ${decision} by HR. Comment: "${reviewComment || 'None'}"`,
      type: 'attendance',
    });

    return res.status(200).json({
      success: true,
      message: `Correction request ${decision} successfully.`,
      attendance: record,
    });
  } catch (error) {
    next(error);
  }
};

