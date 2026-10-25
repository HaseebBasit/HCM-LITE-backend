import {
  getAdminDashboardData,
  getHrDashboardData,
  getEmployeeDashboardData,
  getHeadcountStats,
  getMonthlyAttendanceMetrics,
  getLateComers,
  getLeaveSummary,
} from '../services/analyticsService.js';

export const getAdminAnalytics = async (req, res, next) => {
  try {
    const data = await getAdminDashboardData();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getHrAnalytics = async (req, res, next) => {
  try {
    const data = await getHrDashboardData();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getEmployeeAnalytics = async (req, res, next) => {
  try {
    const data = await getEmployeeDashboardData(req.user._id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getHeadcount = async (req, res, next) => {
  try {
    const { department } = req.query;
    const data = await getHeadcountStats(department);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getLateComersReport = async (req, res, next) => {
  try {
    const { month } = req.query;
    const data = await getLateComers(month);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getLeaveSummaryReport = async (req, res, next) => {
  try {
    const { department } = req.query;
    const data = await getLeaveSummary(department);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

