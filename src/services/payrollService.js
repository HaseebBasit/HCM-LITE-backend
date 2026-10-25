import { PayrollRun } from '../models/PayrollRun.js';
import { User } from '../models/User.js';
import { Attendance } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';
import { Holiday } from '../models/Holiday.js';
import { getWorkingDaysInMonth, formatDateString, calculateWorkingDays } from '../utils/dateUtils.js';
import { calculatePayrollForEmployee } from '../utils/taxCalculator.js';

export const generateDraftPayroll = async (yearMonthStr, preparedById) => {
  if (typeof yearMonthStr !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonthStr)) {
    const err = new Error('Payroll month must use YYYY-MM format.');
    err.statusCode = 422;
    throw err;
  }
  // Check if finalized run already exists
  const existing = await PayrollRun.findOne({ month: yearMonthStr });
  if (existing && existing.isFinalized) {
    const err = new Error(`Payroll for ${yearMonthStr} has already been finalized and locked.`);
    err.statusCode = 409;
    throw err;
  }

  // Fetch public holidays
  const holidays = await Holiday.find().select('date');
  const holidayDates = holidays.map((h) => h.date);

  const totalWorkingDays = getWorkingDaysInMonth(yearMonthStr, holidayDates) || 22;

  const [year, monthNumber] = yearMonthStr.split('-').map(Number);
  const monthStart = `${yearMonthStr}-01`;
  const monthEnd = formatDateString(new Date(year, monthNumber, 0));
  const currentMonth = formatDateString(new Date()).slice(0, 7);
  if (yearMonthStr > currentMonth) {
    const err = new Error('Payroll cannot be generated for a future month.');
    err.statusCode = 422;
    throw err;
  }
  const cutoffDate = yearMonthStr === currentMonth
    ? [formatDateString(new Date()), monthEnd].sort()[0]
    : monthEnd;

  // Include former employees whose exit date is inside this payroll period.
  const employees = await User.find({
    role: { $in: ['Employee', 'employee'] },
    joiningDate: { $lte: new Date(`${cutoffDate}T23:59:59.999Z`) },
    $or: [
      { isActive: true },
      { exitDate: { $gte: new Date(`${monthStart}T00:00:00.000Z`), $lte: new Date(`${monthEnd}T23:59:59.999Z`) } },
    ],
  });

  const records = [];
  let totalGross = 0;
  let totalDeductions = 0;
  let totalTax = 0;
  let totalNet = 0;

  for (const emp of employees) {
    const basic = emp.salary?.basic || 0;

    // Calculate attendance penalties in yearMonthStr
    // Query attendance records for this employee in month
    const regex = new RegExp(`^${yearMonthStr}`);
    const attendances = await Attendance.find({
      userId: emp._id,
      date: { $regex: regex, $lte: cutoffDate },
    });

    const leaves = await Leave.find({
      userId: emp._id,
      status: 'approved',
      $or: [
        { startDate: { $lte: cutoffDate }, endDate: { $gte: monthStart } },
      ],
    });

    const employeeStart = [monthStart, formatDateString(emp.joiningDate || new Date())].sort().at(-1);
    const employmentEnd = emp.exitDate ? formatDateString(emp.exitDate) : cutoffDate;
    const employeeEnd = [employmentEnd, cutoffDate].sort()[0];
    const eligibleWorkingDays = employeeStart <= employeeEnd
      ? calculateWorkingDays(employeeStart, employeeEnd, holidayDates)
      : 0;
    const holidaySet = new Set(holidayDates.map((date) => String(date).slice(0, 10)));
    const leaveDateSet = new Set();
    let unpaidLeaveDays = 0;
    for (const leave of leaves) {
      const rangeStart = [employeeStart, leave.startDate].sort().at(-1);
      const rangeEnd = [employeeEnd, cutoffDate, leave.endDate].sort()[0];
      if (rangeStart > rangeEnd) continue;
      const workingLeaveDays = calculateWorkingDays(rangeStart, rangeEnd, holidayDates);
      if (leave.type === 'unpaid') unpaidLeaveDays += workingLeaveDays;
      const cursor = new Date(`${rangeStart}T00:00:00Z`);
      const end = new Date(`${rangeEnd}T00:00:00Z`);
      while (cursor <= end) {
        const date = cursor.toISOString().slice(0, 10);
        const weekday = cursor.getUTCDay();
        if (weekday !== 0 && weekday !== 6 && !holidaySet.has(date)) leaveDateSet.add(date);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    const attendanceByDate = new Map(attendances.map((attendance) => [attendance.date, attendance]));
    let halfDays = 0;
    let absentDays = 0;
    const cursor = employeeStart <= employeeEnd ? new Date(`${employeeStart}T00:00:00Z`) : null;
    const end = new Date(`${employeeEnd}T00:00:00Z`);
    while (cursor && cursor <= end) {
      const date = cursor.toISOString().slice(0, 10);
      const weekday = cursor.getUTCDay();
      if (weekday !== 0 && weekday !== 6 && !holidaySet.has(date) && !leaveDateSet.has(date)) {
        const attendance = attendanceByDate.get(date);
        if (!attendance || attendance.status === 'absent') absentDays++;
        else if (attendance.status === 'half_day') halfDays++;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const calc = calculatePayrollForEmployee({
      basicSalary: basic,
      totalWorkingDays,
      absentDays,
      unpaidLeaveDays,
      halfDays,
      eligibleWorkingDays,
    });

    records.push({
      employee: emp._id,
      userId: emp._id,
      employeeName: emp.name,
      employeeCode: emp.employeeCode || emp.employeeId || 'N/A',
      employeeId: emp.employeeId || emp.employeeCode || 'N/A',
      department: emp.department || 'General',
      designation: emp.designation || 'Staff',
      ...calc,
    });

    totalGross += calc.gross;
    totalDeductions += calc.deductions;
    totalTax += calc.monthlyTax;
    totalNet += calc.netPay;
  }

  // Upsert draft
  let payrollRun;
  if (existing) {
    existing.records = records;
    existing.slips = records;
    if (preparedById) existing.preparedBy = preparedById;
    existing.totalWorkingDays = totalWorkingDays;
    existing.totalGross = Math.round(totalGross * 100) / 100;
    existing.totalPayrollCost = existing.totalGross;
    existing.totalDeductions = Math.round(totalDeductions * 100) / 100;
    existing.totalTax = Math.round(totalTax * 100) / 100;
    existing.totalNet = Math.round(totalNet * 100) / 100;
    existing.totalNetPaid = existing.totalNet;
    existing.status = 'draft';
    existing.isFinalized = false;
    payrollRun = await existing.save();
  } else {
    payrollRun = await PayrollRun.create({
      month: yearMonthStr,
      status: 'draft',
      isFinalized: false,
      preparedBy: preparedById || null,
      totalWorkingDays,
      records,
      slips: records,
      totalGross: Math.round(totalGross * 100) / 100,
      totalPayrollCost: Math.round(totalGross * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalNet: Math.round(totalNet * 100) / 100,
      totalNetPaid: Math.round(totalNet * 100) / 100,
    });
  }

  return payrollRun;
};

export const finalizePayroll = async ({ yearMonthStr, adminUserId }) => {
  const payroll = await PayrollRun.findOne({ month: yearMonthStr });
  if (!payroll) {
    const err = new Error(`No payroll run draft found for ${yearMonthStr}. Generate draft first.`);
    err.statusCode = 404;
    throw err;
  }

  if (payroll.isFinalized) {
    const err = new Error(`Payroll for ${yearMonthStr} is already finalized.`);
    err.statusCode = 409;
    throw err;
  }

  payroll.status = 'finalized';
  payroll.isFinalized = true;
  payroll.finalizedBy = adminUserId;
  payroll.finalizedAt = new Date();
  await payroll.save();

  return payroll;
};

