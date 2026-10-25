import { Attendance } from '../models/Attendance.js';
import { Company } from '../models/Company.js';
import { User } from '../models/User.js';
import { formatDateString } from '../utils/dateUtils.js';

export const getCompanyConfig = async () => {
  let company = await Company.findOne();
  if (!company) {
    company = {
      workHours: { start: '09:00', end: '18:00' },
      gracePeriodMinutes: 15,
      halfDayHoursThreshold: 5.0,
    };
  }
  return company;
};

export const checkInEmployee = async ({
  userId,
  faceVerified = false,
  facePhotoUrl = '',
}) => {
  const today = formatDateString(new Date());

  // Rule 4.A.7: Exactly 1 check-in per calendar date per employee
  const existing = await Attendance.findOne({ userId, date: today });
  if (existing) {
    const error = new Error('You have already checked in for today.');
    error.statusCode = 409;
    throw error;
  }

  const company = await getCompanyConfig();

  if (faceVerified !== true) {
    const error = new Error('Camera check-in requires exactly one face in the live frame.');
    error.statusCode = 422;
    throw error;
  }

  const now = new Date();
  const [startHour, startMin] = (company.workHours?.start || '09:00').split(':').map(Number);
  const graceMinutes = company.gracePeriodMinutes || 15;

  const thresholdTime = new Date(now);
  thresholdTime.setHours(startHour, startMin + graceMinutes, 0, 0);

  // If checkInTime > 09:15 -> late
  const isLate = now > thresholdTime;
  const status = isLate ? 'late' : 'present';

  const record = await Attendance.create({
    userId,
    date: today,
    checkIn: now,
    checkOut: null,
    status,
    workHours: 0,
    isMissingCheckout: true,
    faceVerified: Boolean(faceVerified),
    facePhotoUrl: facePhotoUrl || '',
  });

  return record;
};

export const checkOutEmployee = async ({ userId }) => {
  const today = formatDateString(new Date());
  const record = await Attendance.findOne({ userId, date: today });

  if (!record || !record.checkIn) {
    const error = new Error('No check-in record found for today. Please check in first.');
    error.statusCode = 404;
    throw error;
  }

  if (record.checkOut) {
    const error = new Error('You have already checked out for today.');
    error.statusCode = 409;
    throw error;
  }

  const now = new Date();
  record.checkOut = now;
  record.isMissingCheckout = false;

  const diffMs = now.getTime() - new Date(record.checkIn).getTime();
  const workHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
  record.workHours = workHours;

  const company = await getCompanyConfig();
  const halfDayThreshold = company.halfDayHoursThreshold || 5.0;

  // Rule 4.A.4: If (checkOut - checkIn) < 5.0 hours, status = half_day
  if (workHours < halfDayThreshold) {
    record.status = 'half_day';
  }

  await record.save();
  return record;
};

export const requestCorrection = async ({ userId, date, requestedCheckIn, requestedCheckOut, reason }) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    const error = new Error('Correction date must use a valid YYYY-MM-DD date.');
    error.statusCode = 422;
    throw error;
  }
  const checkIn = new Date(requestedCheckIn);
  const checkOut = requestedCheckOut ? new Date(requestedCheckOut) : null;
  if (Number.isNaN(checkIn.getTime()) || (checkOut && Number.isNaN(checkOut.getTime())) || (checkOut && checkOut <= checkIn)) {
    const error = new Error('Enter valid correction times, with check-out after check-in.');
    error.statusCode = 422;
    throw error;
  }
  if (String(reason || '').trim().length < 5 || String(reason).length > 1000) {
    const error = new Error('Correction reason must be between 5 and 1,000 characters.');
    error.statusCode = 422;
    throw error;
  }

  let record = await Attendance.findOne({ userId, date });
  if (record?.correctionRequest?.status === 'pending') {
    const error = new Error('A correction request for this date is already awaiting review.');
    error.statusCode = 409;
    throw error;
  }
  if (!record) {
    // If no record exists for that date (e.g. employee was absent), create placeholder record
    record = new Attendance({
      userId,
      date,
      status: 'absent',
      isMissingCheckout: false,
    });
  }

  record.correctionRequest = {
    hasRequest: true,
    requestedCheckIn: checkIn,
    requestedCheckOut: checkOut,
    reason,
    status: 'pending',
    reviewedBy: null,
    reviewComment: '',
    reviewedAt: null,
  };

  await record.save();
  return record;
};

export const reviewCorrection = async ({ attendanceId, reviewerId, decision, reviewComment }) => {
  const record = await Attendance.findById(attendanceId);
  if (!record || !record.correctionRequest?.hasRequest) {
    const error = new Error('Correction request not found.');
    error.statusCode = 404;
    throw error;
  }

  if (decision !== 'approved' && decision !== 'rejected') {
    const error = new Error('Decision must be "approved" or "rejected".');
    error.statusCode = 400;
    throw error;
  }

  record.correctionRequest.status = decision;
  record.correctionRequest.reviewedBy = reviewerId;
  record.correctionRequest.reviewComment = reviewComment || '';
  record.correctionRequest.reviewedAt = new Date();

  if (decision === 'approved') {
    record.checkIn = record.correctionRequest.requestedCheckIn;
    const company = await getCompanyConfig();
    const [startHour, startMinute] = (company.workHours?.start || '09:00').split(':').map(Number);
    const graceMinutes = company.gracePeriodMinutes ?? 15;
    const cutoff = new Date(record.checkIn);
    cutoff.setHours(startHour, startMinute + graceMinutes, 0, 0);
    const baseStatus = record.checkIn > cutoff ? 'late' : 'present';
    if (record.correctionRequest.requestedCheckOut) {
      record.checkOut = record.correctionRequest.requestedCheckOut;
      const diffMs =
        new Date(record.checkOut).getTime() - new Date(record.checkIn).getTime();
      record.workHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
      record.isMissingCheckout = false;
      record.status = record.workHours < (company.halfDayHoursThreshold ?? 5) ? 'half_day' : baseStatus;
    } else {
      record.checkOut = null;
      record.isMissingCheckout = true;
      record.status = baseStatus;
    }
  }

  await record.save();
  return record;
};

