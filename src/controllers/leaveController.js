import { Leave } from '../models/Leave.js';
import { applyLeave, cancelLeave, reviewLeave } from '../services/leaveService.js';
import { logAudit } from '../services/auditService.js';
import { createNotification } from '../services/notificationService.js';

export const apply = async (req, res, next) => {
  try {
    const { type, startDate, endDate, reason } = req.body;

    if (!type || !startDate || !endDate || !reason) {
      return res.status(422).json({
        success: false,
        message: 'Type, Start Date, End Date, and Reason are required.',
      });
    }

    const leave = await applyLeave({
      userId: req.user._id,
      type,
      startDate,
      endDate,
      reason,
    });

    await logAudit({
      req,
      action: 'APPLY_LEAVE',
      entity: 'Leave',
      entityId: leave._id,
      after: leave.toObject(),
    });

    return res.status(201).json({
      success: true,
      message: `Leave application submitted for ${leave.daysCount} working day(s).`,
      leave,
    });
  } catch (error) {
    next(error);
  }
};

export const cancel = async (req, res, next) => {
  try {
    const { id } = req.params;
    const leave = await cancelLeave({ leaveId: id, userId: req.user._id });

    await logAudit({
      req,
      action: 'CANCEL_LEAVE',
      entity: 'Leave',
      entityId: leave._id,
      after: { status: leave.status },
    });

    return res.status(200).json({
      success: true,
      message: 'Leave application cancelled.',
      leave,
    });
  } catch (error) {
    next(error);
  }
};

export const getLeaves = async (req, res, next) => {
  try {
    const { status, type, userId } = req.query;
    const query = {};

    // Data scoping: Employee can only see own leaves
    if (String(req.user.role || '').toLowerCase() === 'employee') {
      query.userId = req.user._id;
    } else if (userId) {
      query.userId = userId;
    }

    if (status && status !== 'all') query.status = status;
    if (type && type !== 'all') query.type = type;

    const leaves = await Leave.find(query)
      .populate('userId', 'name employeeId department leaveBalances')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      total: leaves.length,
      leaves,
    });
  } catch (error) {
    next(error);
  }
};

export const review = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { decision } = req.body;
    const reviewComment = req.body.reviewComment ?? req.body.comment ?? req.body.remarks;

    if (typeof reviewComment !== 'string' || reviewComment.trim().length < 2 || reviewComment.length > 1000) {
      return res.status(422).json({ success: false, message: 'Review remarks must be between 2 and 1,000 characters.' });
    }

    const { leave, user } = await reviewLeave({
      leaveId: id,
      reviewerId: req.user._id,
      decision,
      reviewComment,
    });

    await logAudit({
      req,
      action: `REVIEW_LEAVE_${decision.toUpperCase()}`,
      entity: 'Leave',
      entityId: leave._id,
      after: { decision, reviewComment },
    });

    await createNotification({
      userId: leave.userId,
      title: `Leave Application ${decision === 'approved' ? 'Approved' : 'Rejected'}`,
      message: `Your ${leave.type.toUpperCase()} leave request (${leave.startDate} to ${leave.endDate}) was ${decision} by HR. Comment: "${reviewComment}"`,
      type: 'leave_update',
    });

    return res.status(200).json({
      success: true,
      message: `Leave application ${decision} successfully.`,
      leave,
      userUpdatedBalances: user.leaveBalances,
    });
  } catch (error) {
    next(error);
  }
};

