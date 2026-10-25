import { handleAIChat, generateDashboardSummary } from '../services/aiService.js';
import { AiLog } from '../models/AiLog.js';
import { getAdminDashboardData, getHrDashboardData } from '../services/analyticsService.js';

const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 20;
const requestsByUser = new Map();

const enforceUserRateLimit = async (userId) => {
  const now = Date.now();
  const key = String(userId);
  const recent = (requestsByUser.get(key) || []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= LIMIT) return false;
  const persistedCount = await AiLog.countDocuments({ user: userId, createdAt: { $gte: new Date(now - WINDOW_MS) } });
  if (persistedCount >= LIMIT) return false;
  recent.push(now);
  requestsByUser.set(key, recent);
  if (requestsByUser.size > 10000) {
    for (const [id, times] of requestsByUser) {
      if (!times.some((time) => now - time < WINDOW_MS)) requestsByUser.delete(id);
    }
  }
  return true;
};

export const chat = async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(422).json({ success: false, message: 'Message text is required.' });
    }
    if (message.trim().length > 2000) {
      return res.status(422).json({ success: false, message: 'Messages must be 2,000 characters or fewer.' });
    }
    if (!(await enforceUserRateLimit(req.user._id))) {
      return res.status(429).json({ success: false, message: 'AI assistant limit reached. Try again after the hourly window resets.' });
    }

    // 15 second timeout protection
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('AI Request timed out after 15 seconds.')), 15000);
    });

    const chatPromise = handleAIChat({
      message: message.trim(),
      user: req.user,
    });

    const result = await Promise.race([chatPromise, timeoutPromise]).finally(() => clearTimeout(timeoutId));

    await AiLog.create({
      user: req.user._id,
      role: req.user.role,
      message: message.trim(),
      reply: String(result.reply || '').slice(0, 8000),
      tool: result.toolCall?.tool || '',
      outcome: result.isSalaryRestricted ? 'restricted' : 'success',
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (req.user && req.body?.message) {
      AiLog.create({
        user: req.user._id,
        role: req.user.role,
        message: String(req.body.message).slice(0, 2000),
        reply: error.message,
        outcome: 'error',
      }).catch(() => {});
    }
    if (error.message.includes('timed out')) {
      return res.status(504).json({
        success: false,
        message: 'The AI assistant request took longer than 15 seconds. Please try again with a more specific query.',
      });
    }
    next(error);
  }
};

export const summary = async (req, res, next) => {
  try {
    if (!(await enforceUserRateLimit(req.user._id))) {
      return res.status(429).json({ success: false, message: 'AI assistant limit reached. Try again after the hourly window resets.' });
    }
    const isAdmin = String(req.user.role || '').toLowerCase() === 'admin';
    const metrics = isAdmin ? await getAdminDashboardData() : await getHrDashboardData();
    const kpis = isAdmin
      ? metrics.kpis
      : { ...metrics.todayAttendance, ...metrics.monthlyMetrics };
    const result = await generateDashboardSummary(kpis);

    await AiLog.create({
      user: req.user._id,
      role: req.user.role,
      message: 'Generate a dashboard summary',
      reply: String(result.summary || result.reply || '').slice(0, 8000),
      tool: 'dashboard_summary',
      outcome: 'success',
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

