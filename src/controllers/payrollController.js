import { PayrollRun } from '../models/PayrollRun.js';
import { generateDraftPayroll, finalizePayroll } from '../services/payrollService.js';
import { logAudit } from '../services/auditService.js';
import { createNotification } from '../services/notificationService.js';
import { formatDateString } from '../utils/dateUtils.js';

export const generateDraft = async (req, res, next) => {
  try {
    const { month } = req.body;
    const currentMonth = formatDateString(new Date()).substring(0, 7);
    const targetMonth = month || currentMonth;

    const payrollRun = await generateDraftPayroll(targetMonth, req.user._id);

    await logAudit({
      req,
      action: 'GENERATE_PAYROLL_DRAFT',
      entity: 'PayrollRun',
      entityId: payrollRun._id,
      after: {
        month: payrollRun.month,
        totalEmployees: payrollRun.records.length,
        totalGross: payrollRun.totalGross,
        totalNet: payrollRun.totalNet,
      },
    });

    return res.status(200).json({
      success: true,
      message: `Payroll draft for ${targetMonth} calculated successfully.`,
      payrollRun,
    });
  } catch (error) {
    next(error);
  }
};

export const finalize = async (req, res, next) => {
  try {
    const { month } = req.body;
    if (!month) {
      return res.status(422).json({ success: false, message: 'Month (YYYY-MM) is required.' });
    }

    const payroll = await finalizePayroll({
      yearMonthStr: month,
      adminUserId: req.user._id,
    });

    await logAudit({
      req,
      action: 'FINALIZE_PAYROLL',
      entity: 'PayrollRun',
      entityId: payroll._id,
      after: {
        month: payroll.month,
        isFinalized: true,
        finalizedAt: payroll.finalizedAt,
      },
    });

    // Notify all employees that payslips are ready
    for (const record of payroll.records) {
      await createNotification({
        userId: record.userId,
        title: `Payslip Ready for ${payroll.month}`,
        message: `Your payslip for ${payroll.month} has been finalized. Net Pay: PKR ${record.netPay.toLocaleString()}.`,
        type: 'payroll',
      });
    }

    return res.status(200).json({
      success: true,
      message: `Payroll for ${month} finalized and locked permanently.`,
      payroll,
      payrollRun: payroll,
    });
  } catch (error) {
    next(error);
  }
};

export const getPayrollRuns = async (req, res, next) => {
  try {
    const runs = await PayrollRun.find()
      .select('month status isFinalized totalWorkingDays totalGross totalDeductions totalTax totalNet createdAt finalizedAt')
      .sort({ month: -1 });

    return res.status(200).json({
      success: true,
      payrollRuns: runs,
    });
  } catch (error) {
    next(error);
  }
};

export const getPayrollByMonth = async (req, res, next) => {
  try {
    const { month } = req.params;
    const payroll = await PayrollRun.findOne({ month });
    if (!payroll) {
      return res.status(404).json({ success: false, message: `No payroll run found for ${month}.` });
    }

    return res.status(200).json({
      success: true,
      payroll,
    });
  } catch (error) {
    next(error);
  }
};

export const getMyPayslips = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Only finalized runs are officially accessible to employees
    const payrollRuns = await PayrollRun.find({
      status: 'finalized',
      'records.userId': userId,
    }).sort({ month: -1 });

    const payslips = [];
    payrollRuns.forEach((run) => {
      const record = run.records.find((r) => r.userId.toString() === userId.toString());
      if (record) {
        payslips.push({
          payrollId: run._id,
          month: run.month,
          totalWorkingDays: run.totalWorkingDays,
          finalizedAt: run.finalizedAt,
          ...record.toObject(),
        });
      }
    });

    return res.status(200).json({
      success: true,
      payslips,
    });
  } catch (error) {
    next(error);
  }
};

export const getSinglePayslip = async (req, res, next) => {
  try {
    const { id } = req.params; // record ID or user ID + month

    // Find payroll run containing this record
    const payroll = await PayrollRun.findOne({ 'records._id': id });
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payslip record not found.' });
    }

    const record = payroll.records.id(id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Payslip record not found.' });
    }

    // Strict Scoping: Employee can only see own payslip
    if (String(req.user.role || '').toLowerCase() === 'employee' && req.user._id.toString() !== record.userId.toString()) {
      return res.status(403).json({ success: false, message: 'Forbidden: You can only view your own payslip.' });
    }

    if (String(req.user.role || '').toLowerCase() === 'employee' && !payroll.isFinalized) {
      return res.status(404).json({ success: false, message: 'Payslip is not available until payroll is finalized.' });
    }

    return res.status(200).json({
      success: true,
      month: payroll.month,
      isFinalized: payroll.isFinalized,
      finalizedAt: payroll.finalizedAt,
      payslip: record,
    });
  } catch (error) {
    next(error);
  }
};

