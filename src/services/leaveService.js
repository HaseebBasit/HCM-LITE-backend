import { Leave } from '../models/Leave.js';
import { User } from '../models/User.js';
import { Holiday } from '../models/Holiday.js';
import { calculateWorkingDays } from '../utils/dateUtils.js';

export const applyLeave = async ({ userId, type, startDate, endDate, reason }) => {
  if (!['annual', 'sick', 'casual', 'unpaid'].includes(type)) {
    const err = new Error('Invalid leave type. Must be annual, sick, casual, or unpaid.');
    err.statusCode = 422;
    throw err;
  }

  if (new Date(startDate) > new Date(endDate)) {
    const err = new Error('Start date cannot be after end date.');
    err.statusCode = 422;
    throw err;
  }

  // Fetch holidays to skip them during calculation
  const holidays = await Holiday.find().select('date');
  const holidayDates = holidays.map((h) => h.date);

  // Rule 4.B.1: Working days only
  const daysCount = calculateWorkingDays(startDate, endDate, holidayDates);

  if (daysCount <= 0) {
    const err = new Error('Selected date range contains no working days (all weekends or public holidays).');
    err.statusCode = 422;
    throw err;
  }

  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }

  // Rule 4.B.2 & 4.B.3: Check available quota for paid leaves
  if (type !== 'unpaid') {
    const availableBalance = user.leaveBalances?.[type] ?? 0;
    if (daysCount > availableBalance) {
      const err = new Error(
        `Insufficient leave quota. Requested ${daysCount} days, but remaining ${type} balance is ${availableBalance} days.`
      );
      err.statusCode = 422;
      throw err;
    }
  }

  // Check for overlapping pending or approved leave requests
  const overlap = await Leave.findOne({
    userId,
    status: { $in: ['pending', 'approved'] },
    $or: [
      { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
    ],
  });

  if (overlap) {
    const err = new Error(
      `Overlap detected: You already have an active or pending leave request from ${overlap.startDate} to ${overlap.endDate}.`
    );
    err.statusCode = 422;
    throw err;
  }

  const leave = await Leave.create({
    userId,
    type,
    startDate,
    endDate,
    daysCount,
    reason,
    status: 'pending',
  });

  return leave;
};

export const cancelLeave = async ({ leaveId, userId }) => {
  const leave = await Leave.findById(leaveId);
  if (!leave) {
    const err = new Error('Leave request not found.');
    err.statusCode = 404;
    throw err;
  }

  if (leave.userId.toString() !== userId.toString()) {
    const err = new Error('Forbidden: You can only cancel your own leave requests.');
    err.statusCode = 403;
    throw err;
  }

  if (leave.status !== 'pending') {
    const err = new Error(`Cannot cancel a leave that is already ${leave.status}.`);
    err.statusCode = 422;
    throw err;
  }

  leave.status = 'cancelled';
  await leave.save();
  return leave;
};

export const reviewLeave = async ({ leaveId, reviewerId, decision, reviewComment }) => {
  if (!['approved', 'rejected'].includes(decision)) {
    const err = new Error('Decision must be "approved" or "rejected".');
    err.statusCode = 400;
    throw err;
  }

  if (!reviewComment || !reviewComment.trim()) {
    const err = new Error('Mandatory HR review comment is required.');
    err.statusCode = 422;
    throw err;
  }

  const leave = await Leave.findById(leaveId);
  if (!leave) {
    const err = new Error('Leave request not found.');
    err.statusCode = 404;
    throw err;
  }

  if (leave.status !== 'pending') {
    const err = new Error(`Leave request has already been ${leave.status}.`);
    err.statusCode = 409;
    throw err;
  }

  const user = await User.findById(leave.userId);
  if (!user) {
    const err = new Error('Associated employee not found.');
    err.statusCode = 404;
    throw err;
  }

  if (decision === 'approved' && leave.type !== 'unpaid') {
    const currentBalance = user.leaveBalances?.[leave.type] ?? 0;
    if (leave.daysCount > currentBalance) {
      const err = new Error(
        `Cannot approve: Employee now only has ${currentBalance} ${leave.type} days remaining (needs ${leave.daysCount}).`
      );
      err.statusCode = 422;
      throw err;
    }

    user.leaveBalances[leave.type] = currentBalance - leave.daysCount;
    await user.save();
  }

  leave.status = decision;
  leave.reviewedBy = reviewerId;
  leave.reviewComment = reviewComment.trim();
  leave.reviewedAt = new Date();
  await leave.save();

  return { leave, user };
};

