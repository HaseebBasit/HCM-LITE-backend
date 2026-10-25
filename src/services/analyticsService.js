import { User } from '../models/User.js';
import { Attendance } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';
import { PayrollRun } from '../models/PayrollRun.js';
import { Holiday } from '../models/Holiday.js';
import { formatDateString, getWorkingDaysInMonth } from '../utils/dateUtils.js';

export const getHeadcountStats = async (department) => {
  const query = { role: { $in: ['Employee', 'employee'] }, isActive: true };
  if (department) {
    query.department = new RegExp(`^${department}$`, 'i');
  }

  const total = await User.countDocuments(query);
  const byDepartment = await User.aggregate([
    { $match: { role: { $in: ['Employee', 'employee'] }, isActive: true } },
    { $group: { _id: '$department', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  return {
    total,
    department: department || 'All',
    distribution: byDepartment.map((d) => ({ department: d._id || 'Unassigned', count: d.count })),
  };
};

export const getTodayAttendanceSummary = async () => {
  const today = formatDateString(new Date());
  const totalEmployees = await User.countDocuments({ role: { $in: ['Employee', 'employee'] }, isActive: true });

  const records = await Attendance.find({ date: today }).populate('userId', 'name employeeId department');

  let present = 0;
  let late = 0;
  let halfDay = 0;
  let missingCheckout = 0;

  records.forEach((r) => {
    if (r.status === 'present') present++;
    if (r.status === 'late') late++;
    if (r.status === 'half_day') halfDay++;
    if (r.isMissingCheckout) missingCheckout++;
  });

  const checkedInCount = records.length;
  const absentEstimate = Math.max(0, totalEmployees - checkedInCount);

  return {
    date: today,
    totalEmployees,
    checkedInCount,
    present,
    late,
    halfDay,
    missingCheckout,
    absentEstimate,
    attendanceList: records,
  };
};

export const getMonthlyAttendanceMetrics = async (yearMonthStr) => {
  const ym = yearMonthStr || formatDateString(new Date()).substring(0, 7);
  const regex = new RegExp(`^${ym}`);

  const totalEmployees = await User.countDocuments({ role: { $in: ['Employee', 'employee'] }, isActive: true });
  const holidays = await Holiday.find().select('date');
  const workingDaysInMonth = getWorkingDaysInMonth(ym, holidays.map((h) => h.date)) || 22;

  const records = await Attendance.find({ date: { $regex: regex } });

  let present = 0;
  let late = 0;
  let halfDay = 0;
  let missingCheckout = 0;

  records.forEach((r) => {
    if (r.status === 'present') present++;
    if (r.status === 'late') late++;
    if (r.status === 'half_day') halfDay++;
    if (r.isMissingCheckout) missingCheckout++;
  });

  // Approved leaves in month
  const approvedLeaves = await Leave.find({
    status: 'approved',
    $or: [{ startDate: { $regex: regex } }, { endDate: { $regex: regex } }],
  });

  let totalApprovedLeaveDays = 0;
  approvedLeaves.forEach((l) => (totalApprovedLeaveDays += l.daysCount || 0));

  const totalWorkingDaysScheduled = totalEmployees * workingDaysInMonth;
  const denominator = Math.max(1, totalWorkingDaysScheduled - totalApprovedLeaveDays);
  const numerator = present + late + missingCheckout + 0.5 * halfDay;
  const attendanceRate = totalEmployees === 0 ? 0 : Math.min(100, Math.round((numerator / denominator) * 1000) / 10);

  const lateDenominator = present + late;
  const latePercentage =
    lateDenominator > 0 ? Math.round((late / lateDenominator) * 1000) / 10 : 0;

  // Attrition rate
  const exitsInMonth = await User.countDocuments({
    role: { $in: ['Employee', 'employee'] },
    exitDate: { $gte: new Date(`${ym}-01`), $lte: new Date(`${ym}-31`) },
  });
  const avgHeadcount = Math.max(1, totalEmployees);
  const attritionRate = totalEmployees === 0 ? 0 : Math.round((exitsInMonth / avgHeadcount) * 1000) / 10;

  return {
    month: ym,
    totalEmployees,
    workingDaysInMonth,
    present,
    late,
    halfDay,
    attendanceRate,
    latePercentage,
    attritionRate,
  };
};

export const getLateComers = async (yearMonthStr) => {
  const ym = yearMonthStr || formatDateString(new Date()).substring(0, 7);
  const regex = new RegExp(`^${ym}`);

  const lateRecords = await Attendance.find({
    date: { $regex: regex },
    status: 'late',
  }).populate('userId', 'name employeeId department');

  const employeeMap = {};
  lateRecords.forEach((r) => {
    if (!r.userId) return;
    const id = r.userId._id.toString();
    if (!employeeMap[id]) {
      employeeMap[id] = {
        name: r.userId.name,
        employeeId: r.userId.employeeId,
        department: r.userId.department,
        lateCount: 0,
        dates: [],
      };
    }
    employeeMap[id].lateCount++;
    employeeMap[id].dates.push({ date: r.date, checkIn: r.checkIn });
  });

  return Object.values(employeeMap).sort((a, b) => b.lateCount - a.lateCount);
};

export const getLeaveSummary = async (department) => {
  const matchUser = { role: { $in: ['Employee', 'employee'] } };
  if (department) {
    matchUser.department = new RegExp(`^${department}$`, 'i');
  }

  const users = await User.find(matchUser).select('_id');
  const userIds = users.map((u) => u._id);

  const pendingCount = await Leave.countDocuments({ userId: { $in: userIds }, status: 'pending' });
  const approvedCount = await Leave.countDocuments({ userId: { $in: userIds }, status: 'approved' });
  const rejectedCount = await Leave.countDocuments({ userId: { $in: userIds }, status: 'rejected' });

  const byType = await Leave.aggregate([
    { $match: { userId: { $in: userIds } } },
    { $group: { _id: '$type', totalDays: { $sum: '$daysCount' } } },
  ]);

  return {
    department: department || 'All',
    pendingCount,
    approvedCount,
    rejectedCount,
    byType: byType.map((t) => ({ type: t._id, days: t.totalDays })),
  };
};

export const getAdminDashboardData = async () => {
  const today = formatDateString(new Date());
  const currentMonth = today.substring(0, 7);

  const headcount = await getHeadcountStats();
  const todayAttendance = await getTodayAttendanceSummary();
  const monthlyMetrics = await getMonthlyAttendanceMetrics(currentMonth);

  const pendingLeaves = await Leave.countDocuments({ status: 'pending' });
  const pendingCorrections = await Attendance.countDocuments({ 'correctionRequest.status': 'pending' });

  // Latest payroll cost
  const latestPayroll = await PayrollRun.findOne().sort({ month: -1 });

  return {
    kpis: {
      totalEmployees: headcount.total,
      attendanceRate: monthlyMetrics.attendanceRate,
      latePercentage: monthlyMetrics.latePercentage,
      attritionRate: monthlyMetrics.attritionRate,
      todayPresent: todayAttendance.present + todayAttendance.late,
      todayAbsent: todayAttendance.absentEstimate,
      pendingApprovals: pendingLeaves + pendingCorrections,
      monthlyPayrollCost: latestPayroll ? latestPayroll.totalNet : 0,
    },
    departmentDistribution: headcount.distribution,
    todayAttendance,
    monthlyMetrics,
    latestPayroll,
  };
};

export const getHrDashboardData = async () => {
  const today = formatDateString(new Date());
  const currentMonth = today.substring(0, 7);

  const todayAttendance = await getTodayAttendanceSummary();
  const monthlyMetrics = await getMonthlyAttendanceMetrics(currentMonth);
  const pendingLeaves = await Leave.find({ status: 'pending' })
    .populate('userId', 'name employeeId department leaveBalances')
    .sort({ createdAt: -1 })
    .limit(10);
  const pendingCorrections = await Attendance.find({ 'correctionRequest.status': 'pending' })
    .populate('userId', 'name employeeId department')
    .sort({ updatedAt: -1 })
    .limit(10);
  const lateComers = await getLateComers(currentMonth);

  return {
    todayAttendance,
    monthlyMetrics,
    pendingLeaves,
    pendingCorrections,
    lateComers: lateComers.slice(0, 5),
  };
};

export const getEmployeeDashboardData = async (userId) => {
  const today = formatDateString(new Date());
  const currentMonth = today.substring(0, 7);

  const user = await User.findById(userId).select('-password');
  const todayRecord = await Attendance.findOne({ userId, date: today });

  const regex = new RegExp(`^${currentMonth}`);
  const monthlyAttendances = await Attendance.find({ userId, date: { $regex: regex } });

  let present = 0;
  let late = 0;
  let halfDay = 0;
  monthlyAttendances.forEach((a) => {
    if (a.status === 'present') present++;
    if (a.status === 'late') late++;
    if (a.status === 'half_day') halfDay++;
  });

  const recentLeaves = await Leave.find({ userId }).sort({ createdAt: -1 }).limit(5);

  const latestPayroll = await PayrollRun.findOne({
    status: 'finalized',
    'records.userId': userId,
  }).sort({ month: -1 });

  let myPayslip = null;
  if (latestPayroll) {
    myPayslip = latestPayroll.records.find((r) => r.userId.toString() === userId.toString());
  }

  return {
    user,
    todayRecord,
    stats: {
      present,
      late,
      halfDay,
      leaveBalances: user.leaveBalances,
    },
    recentLeaves,
    latestPayslip: myPayslip ? { month: latestPayroll.month, ...myPayslip.toObject() } : null,
  };
};

