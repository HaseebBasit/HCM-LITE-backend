import { ENV } from '../config/env.js';
import { User } from '../models/User.js';
import { PayrollRun } from '../models/PayrollRun.js';
import { formatDateString } from '../utils/dateUtils.js';
import {
  getHeadcountStats,
  getMonthlyAttendanceMetrics,
  getLateComers,
  getLeaveSummary,
  getTodayAttendanceSummary,
} from './analyticsService.js';

// Pre-defined System Policies for Grounded Policy Q&A
export const SYSTEM_POLICIES = `
HCM LITE OFFICIAL COMPANY POLICIES:
1. Working Hours: Regular office hours begin at 09:00 AM and end at 06:00 PM (Monday through Friday). Saturdays and Sundays are official weekend off-days.
2. Grace Period: A 15-minute grace period is allowed every morning. Any check-in timestamped after 09:15 AM is classified as 'Late'.
3. Half-Day Rule: Any shift with total recorded working hours strictly under 5.0 hours is classified as a 'Half Day'.
4. Attendance Duplication: Exactly one check-in per calendar date per employee is allowed.
5. Annual Leave Quota: 14 days per calendar year.
6. Sick Leave Quota: 8 days per calendar year.
7. Casual Leave Quota: 10 days per calendar year.
8. Unpaid Leave: Unlimited, but incurs payroll deductions at the calculated daily rate.
9. Weekend & Holiday Exemption: Weekends (Sat-Sun) and configured public holidays are never deducted from leave balances.
10. Salary & Gross Structure: Gross Salary = Basic * 1.5 (where House Rent Allowance HRA is 40% of Basic, Medical Allowance is 10% of Basic).
11. Payroll Deductions: Daily Rate = Gross / Total Working Days in Month. Deductions = Daily Rate * (Absent Days + Unpaid Leave Days + 0.5 * Half Days).
12. Pakistan Income Tax Slabs:
    - Up to PKR 600,000: 0% Tax
    - PKR 600,001 to 1,200,000: 5% on excess over 600,000
    - PKR 1,200,001 to 2,400,000: PKR 30,000 + 15% on excess over 1,200,000
    - PKR 2,400,001 to 3,600,000: PKR 210,000 + 25% on excess over 2,400,000
    - Above PKR 3,600,000: PKR 510,000 + 35% on excess over 3,600,000
13. Attendance Corrections: If an employee forgets to check out or experiences a technical glitch, they must submit an Attendance Correction request with an explanation for HR review.
14. Confidentiality: Employee salary details are strictly private. Employees may only view their own payslips.
`;

// Intent classification and tool dispatch
export const executeScopedTool = async (toolName, toolArgs, user) => {
  const role = String(user?.role || '').toLowerCase();
  const employeeTools = new Set(['get_my_leave_balance']);
  const organizationTools = new Set([
    'get_headcount', 'get_attendance_summary', 'get_late_comers', 'get_leave_summary',
    'get_payroll_summary', 'get_leaves_today', 'search_employees',
  ]);
  if ((role === 'employee' && !employeeTools.has(toolName)) ||
      (role !== 'employee' && !['admin', 'hr'].includes(role)) ||
      !employeeTools.has(toolName) && !organizationTools.has(toolName)) {
    return { tool: toolName, error: 'This assistant action is not available for your role.' };
  }

  switch (toolName) {
    case 'get_headcount': {
      const data = await getHeadcountStats(toolArgs?.department);
      return {
        tool: 'get_headcount',
        result: data,
      };
    }

    case 'get_attendance_summary': {
      const currentMonth = formatDateString(new Date()).substring(0, 7);
      const data = await getMonthlyAttendanceMetrics(toolArgs?.month || currentMonth);
      return {
        tool: 'get_attendance_summary',
        result: data,
      };
    }

    case 'get_late_comers': {
      const currentMonth = formatDateString(new Date()).substring(0, 7);
      const data = await getLateComers(toolArgs?.month || currentMonth);
      return {
        tool: 'get_late_comers',
        result: data,
      };
    }

    case 'get_leave_summary': {
      const data = await getLeaveSummary(toolArgs?.department);
      return {
        tool: 'get_leave_summary',
        result: data,
      };
    }

    case 'get_my_leave_balance': {
      const freshUser = await User.findById(user._id).select('leaveBalances name employeeId');
      return {
        tool: 'get_my_leave_balance',
        result: {
          employeeName: freshUser.name,
          employeeId: freshUser.employeeId,
          leaveBalances: freshUser.leaveBalances,
        },
      };
    }

    case 'get_payroll_summary': {
      const currentMonth = formatDateString(new Date()).substring(0, 7);
      const targetMonth = toolArgs?.month || currentMonth;
      const payroll = await PayrollRun.findOne({ month: targetMonth });
      if (!payroll) {
        return {
          tool: 'get_payroll_summary',
          result: { message: `No payroll generated yet for ${targetMonth}.` },
        };
      }
      return {
        tool: 'get_payroll_summary',
        result: {
          month: payroll.month,
          status: payroll.status,
          isFinalized: payroll.isFinalized,
          totalEmployees: payroll.records.length,
          totalGross: payroll.totalGross,
          totalDeductions: payroll.totalDeductions,
          totalTax: payroll.totalTax,
          totalNet: payroll.totalNet,
        },
      };
    }

    case 'get_leaves_today': {
      const today = formatDateString(new Date());
      const onLeaveToday = await (await import('../models/Leave.js')).Leave.find({
        status: 'approved',
        startDate: { $lte: today },
        endDate: { $gte: today },
      }).populate('userId', 'name employeeId department');
      return {
        tool: 'get_leaves_today',
        result: onLeaveToday.map((l) => ({
          employeeName: l.userId?.name || 'Staff',
          employeeId: l.userId?.employeeId,
          department: l.userId?.department,
          type: l.type,
          reason: l.reason,
        })),
      };
    }

    case 'search_employees': {
      const query = toolArgs?.query || '';
      const filter = {
        role: 'employee',
        isActive: true,
        $or: [
          { name: new RegExp(query, 'i') },
          { email: new RegExp(query, 'i') },
          { employeeId: new RegExp(query, 'i') },
          { department: new RegExp(query, 'i') },
          { designation: new RegExp(query, 'i') },
        ],
      };

      const results = await User.find(filter)
        .select('name email employeeId department designation phone')
        .limit(10);

      return {
        tool: 'search_employees',
        result: results,
      };
    }

    default:
      return null;
  }
};

// Smart Leave extraction: parses natural language leave requests
export const parseSmartLeavePrompt = (prompt) => {
  const lower = prompt.toLowerCase();
  const isLeaveRequest =
    (lower.includes('leave') ||
      lower.includes('off') ||
      lower.includes('vacation') ||
      lower.includes('sick') ||
      lower.includes('casual')) &&
    (lower.includes('need') ||
      lower.includes('want') ||
      lower.includes('apply') ||
      lower.includes('taking') ||
      lower.includes('going'));

  if (!isLeaveRequest) return null;

  let type = 'casual';
  if (lower.includes('sick') || lower.includes('fever') || lower.includes('doctor') || lower.includes('hospital')) {
    type = 'sick';
  } else if (lower.includes('annual') || lower.includes('holiday') || lower.includes('trip')) {
    type = 'annual';
  } else if (lower.includes('unpaid')) {
    type = 'unpaid';
  }

  // Calculate dates relative to today
  const today = new Date();
  let startDate = new Date(today);
  let endDate = new Date(today);

  if (lower.includes('tomorrow')) {
    startDate.setDate(today.getDate() + 1);
    endDate = new Date(startDate);
  } else if (lower.includes('next monday')) {
    const daysUntilNextMon = ((1 + 7 - today.getDay()) % 7) || 7;
    startDate.setDate(today.getDate() + daysUntilNextMon);
    endDate = new Date(startDate);
    if (lower.includes('tuesday')) {
      endDate.setDate(startDate.getDate() + 1);
    } else if (lower.includes('wednesday')) {
      endDate.setDate(startDate.getDate() + 2);
    } else if (lower.includes('friday') || lower.includes('week')) {
      endDate.setDate(startDate.getDate() + 4);
    }
  } else {
    // Default to upcoming Monday-Tuesday if general
    const daysUntilNextMon = ((1 + 7 - today.getDay()) % 7) || 7;
    startDate.setDate(today.getDate() + daysUntilNextMon);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);
  }

  // Extract reason
  let reason = 'Personal leave';
  if (lower.includes('for ')) {
    reason = prompt.split(/for /i)[1].replace(/[.?]/g, '').trim();
  } else if (lower.includes('due to ')) {
    reason = prompt.split(/due to /i)[1].replace(/[.?]/g, '').trim();
  } else if (lower.includes('wedding')) {
    reason = "Family wedding celebration";
  }

  return {
    type,
    startDate: formatDateString(startDate),
    endDate: formatDateString(endDate),
    reason: reason.charAt(0).toUpperCase() + reason.slice(1),
  };
};

/**
 * Handle AI Chat with scoped tool calling and policy answers
 */
export const handleAIChat = async ({ message, user }) => {
  const lowerMsg = message.toLowerCase();

  // Guardrail 1: Salary Confidentiality
  const userRole = String(user.role || '').toLowerCase();
  const asksAboutSalary =
    lowerMsg.includes('salary') ||
    lowerMsg.includes('earning') ||
    lowerMsg.includes('earn') ||
    lowerMsg.includes('compensation') ||
    lowerMsg.includes('package') ||
    lowerMsg.includes('pay');
  if (userRole === 'employee' && asksAboutSalary) {
    return {
      reply: "I am programmed to protect organizational confidentiality. I cannot disclose other employees' salary details.",
      toolCall: null,
      isSalaryRestricted: true,
    };
  }

  // Check for Smart Leave natural language extraction
  const smartLeave = parseSmartLeavePrompt(message);
  if (smartLeave) {
    return {
      reply: `I have prepared your ${smartLeave.type.toUpperCase()} leave request from ${smartLeave.startDate} to ${smartLeave.endDate} for "${smartLeave.reason}". You can review and confirm it below!`,
      isLeaveFormPreFill: true,
      leaveData: smartLeave,
      toolCall: {
        tool: 'smart_leave_prefill',
        result: smartLeave,
      },
    };
  }

  // Check for Tool invocations
  let toolData = null;
  if (lowerMsg.includes('headcount') || lowerMsg.includes('how many employee') || lowerMsg.includes('total staff')) {
    let dept = null;
    if (lowerMsg.includes('engineering') || lowerMsg.includes('it')) dept = 'Engineering';
    if (lowerMsg.includes('sales')) dept = 'Sales';
    if (lowerMsg.includes('hr')) dept = 'HR';
    toolData = await executeScopedTool('get_headcount', { department: dept }, user);
  } else if (lowerMsg.includes('late') && (lowerMsg.includes('comer') || lowerMsg.includes('who is late') || lowerMsg.includes('late arrivals'))) {
    toolData = await executeScopedTool('get_late_comers', {}, user);
  } else if (
    lowerMsg.includes('leave balance') ||
    lowerMsg.includes('my leave') ||
    lowerMsg.includes('leaves remaining') ||
    lowerMsg.includes('sick leave') ||
    lowerMsg.includes('casual leave') ||
    lowerMsg.includes('annual leave') ||
    lowerMsg.includes('leaves do i have') ||
    lowerMsg.includes('leaves left') ||
    lowerMsg.includes('how many leave') ||
    lowerMsg.includes('how many sick')
  ) {
    toolData = await executeScopedTool('get_my_leave_balance', {}, user);
  } else if (lowerMsg.includes('attendance') && (lowerMsg.includes('summary') || lowerMsg.includes('rate') || lowerMsg.includes('stats'))) {
    toolData = await executeScopedTool('get_attendance_summary', {}, user);
  } else if (lowerMsg.includes('payroll') && (lowerMsg.includes('summary') || lowerMsg.includes('total pay') || lowerMsg.includes('cost'))) {
    toolData = await executeScopedTool('get_payroll_summary', {}, user);
  } else if (lowerMsg.includes('on leave today') || lowerMsg.includes('who is on leave') || lowerMsg.includes('on leave')) {
    toolData = await executeScopedTool('get_leaves_today', {}, user);
  } else if (
    (lowerMsg.includes('find employee') || lowerMsg.includes('search employee') || lowerMsg.includes('who is')) &&
    !lowerMsg.includes('leave')
  ) {
    const q = message.replace(/(find employee|search employee|who is)/i, '').trim();
    toolData = await executeScopedTool('search_employees', { query: q }, user);
  }

  // If a tool was executed, generate grounded answer using the tool result
  if (toolData) {
    let reply = '';
    if (toolData.tool === 'get_headcount') {
      const d = toolData.result;
      reply = `The current total active headcount is **${d.total} employees**. Breakdown by department: ${d.distribution.map((x) => `${x.department}: ${x.count}`).join(', ')}.`;
    } else if (toolData.tool === 'get_late_comers') {
      const list = toolData.result;
      if (!list.length) {
        reply = `Great news! There are no recurring late comers recorded for this month.`;
      } else {
        reply = `Here are the top late comers for this month:\n` +
          list.map((c, i) => `${i + 1}. **${c.name}** (${c.department}) — ${c.lateCount} late arrival(s)`).join('\n');
      }
    } else if (toolData.tool === 'get_my_leave_balance') {
      const b = toolData.result.leaveBalances || {};
      if (lowerMsg.includes('sick')) {
        reply = `Hello ${toolData.result.employeeName}! You currently have **${b.sick ?? 8} Sick Leave days** remaining out of your 8-day annual medical entitlement.`;
      } else if (lowerMsg.includes('casual')) {
        reply = `Hello ${toolData.result.employeeName}! You have **${b.casual ?? 10} Casual Leave days** remaining out of your 10-day allowance.`;
      } else if (lowerMsg.includes('annual')) {
        reply = `Hello ${toolData.result.employeeName}! You have **${b.annual ?? 14} Annual Leave days** remaining out of your 14-day allowance.`;
      } else {
        reply = `Hello ${toolData.result.employeeName}! Here is your current leave balance quota:\n- 🏖️ **Annual Leave:** ${b.annual ?? 14} days\n- 🤒 **Sick Leave:** ${b.sick ?? 8} days\n- ☕ **Casual Leave:** ${b.casual ?? 10} days\n- 📝 **Unpaid Leave:** Unlimited (subject to daily rate deduction)`;
      }
    } else if (toolData.tool === 'get_leaves_today') {
      const list = toolData.result || [];
      if (!list.length) {
        reply = `No employees are currently on approved leave today. Full scheduled attendance is in effect!`;
      } else {
        reply = `Employees on approved leave today (${list.length}):\n` +
          list.map((l, i) => `${i + 1}. **${l.employeeName}** (${l.department || 'Staff'}) — ${l.type.toUpperCase()} Leave: "${l.reason}"`).join('\n');
      }
    } else if (toolData.tool === 'get_attendance_summary') {
      const s = toolData.result;
      reply = `Attendance Summary for ${s.month}:\n- Overall Attendance Rate: **${s.attendanceRate}%**\n- Late Arrival Percentage: **${s.latePercentage}%**\n- Present Shifts: ${s.present}\n- Late Shifts: ${s.late}\n- Half Days: ${s.halfDay}`;
    } else if (toolData.tool === 'get_payroll_summary') {
      if (toolData.error) {
        reply = toolData.error;
      } else {
        const p = toolData.result;
        reply = `Monthly Payroll Summary (${p.month}):\n- Status: **${p.status.toUpperCase()}** (${p.isFinalized ? '🔒 Finalized' : '📝 Draft'})\n- Total Employees: ${p.totalEmployees}\n- Gross Payroll: PKR ${p.totalGross?.toLocaleString()}\n- Tax Withheld: PKR ${p.totalTax?.toLocaleString()}\n- Net Disbursed: PKR ${p.totalNet?.toLocaleString()}`;
      }
    } else if (toolData.tool === 'search_employees') {
      const emps = toolData.result;
      if (!emps.length) {
        reply = `No employees matching your search criteria were found.`;
      } else {
        reply = `Found ${emps.length} employee(s):\n` +
          emps.map((e) => `• **${e.name}** (${e.employeeId || 'No ID'}) — ${e.designation}, ${e.department} (${e.email})`).join('\n');
      }
    }

    return {
      reply,
      toolCall: toolData,
    };
  }

  // Policy Q&A check
  if (
    lowerMsg.includes('grace') ||
    lowerMsg.includes('policy') ||
    lowerMsg.includes('work hour') ||
    lowerMsg.includes('office hour') ||
    lowerMsg.includes('tax slab') ||
    lowerMsg.includes('half day') ||
    lowerMsg.includes('quota') ||
    lowerMsg.includes('formula') ||
    lowerMsg.includes('weekend')
  ) {
    if (lowerMsg.includes('grace') || lowerMsg.includes('time') || lowerMsg.includes('late')) {
      return {
        reply: "Official office hours begin at **09:00 AM** with a **15-minute grace period**. Any check-in after **09:15 AM** is recorded as **Late**. A shift of less than **5.0 hours** is classified as a **Half Day**.",
        toolCall: null,
      };
    }
    if (lowerMsg.includes('tax')) {
      return {
        reply: "HCM Lite calculates payroll income tax based on Pakistan Income Tax Slabs:\n- Up to PKR 600,000/yr: **0%**\n- PKR 600,001 - 1,200,000: **5%** of excess over 600k\n- PKR 1,200,001 - 2,400,000: **PKR 30,000 + 15%** of excess\n- PKR 2,400,001 - 3,600,000: **PKR 210,000 + 25%** of excess\n- Above PKR 3,600,000: **PKR 510,000 + 35%** of excess",
        toolCall: null,
      };
    }
    if (lowerMsg.includes('quota') || lowerMsg.includes('leave')) {
      return {
        reply: "Company Leave Policy:\n- **Annual Leave:** 14 days/year\n- **Sick Leave:** 8 days/year\n- **Casual Leave:** 10 days/year\n- **Unpaid Leave:** Unlimited (deducted proportionally from gross payroll)\n- Note: Weekends (Sat-Sun) and configured public holidays are never deducted from your leave quotas.",
        toolCall: null,
      };
    }
  }

  // Gemini function calling stays on the server. The model can request a named
  // action, but only this service executes it and every action is role checked.
  if (ENV.AI_API_KEY) {
    try {
      const role = String(user.role || '').toLowerCase();
      const allowedTools = role === 'employee'
        ? ['get_my_leave_balance']
        : ['get_headcount', 'get_attendance_summary', 'get_late_comers', 'get_leave_summary', 'get_my_leave_balance', 'get_payroll_summary', 'search_employees'];
      const declarations = {
        get_headcount: { description: 'Get active employee headcount, optionally for one department.', parameters: { type: 'OBJECT', properties: { department: { type: 'STRING' } } } },
        get_attendance_summary: { description: 'Get organization attendance metrics for a month in YYYY-MM format.', parameters: { type: 'OBJECT', properties: { month: { type: 'STRING' } } } },
        get_late_comers: { description: 'Get employees with late arrivals for a month.', parameters: { type: 'OBJECT', properties: { month: { type: 'STRING' } } } },
        get_leave_summary: { description: 'Get organization leave summary, optionally for a department.', parameters: { type: 'OBJECT', properties: { department: { type: 'STRING' } } } },
        get_my_leave_balance: { description: 'Get the signed-in user leave balance only.', parameters: { type: 'OBJECT', properties: {} } },
        get_payroll_summary: { description: 'Get organization payroll totals for a month.', parameters: { type: 'OBJECT', properties: { month: { type: 'STRING' } } } },
        search_employees: { description: 'Search employee directory by name or department. Never return salary.', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } }, required: ['query'] } },
      };
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${ENV.AI_MODEL}:generateContent?key=${ENV.AI_API_KEY}`;
      const systemText = `${SYSTEM_POLICIES}\nYou are HCM Lite's assistant. Support English and Roman Urdu. Never disclose salaries or payroll details to employees. Use tools only for facts that require system data. User role: ${role}.`;
      const requestGemini = (contents, tools = true) => fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(14000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents,
          ...(tools ? { tools: [{ functionDeclarations: allowedTools.map((name) => ({ name, ...declarations[name] })) }] } : {}),
        }),
      });
      const firstResponse = await requestGemini([{ role: 'user', parts: [{ text: message }] }]);
      if (firstResponse.ok) {
        const firstData = await firstResponse.json();
        const firstParts = firstData.candidates?.[0]?.content?.parts || [];
        const functionCall = firstParts.find((part) => part.functionCall)?.functionCall;
        if (functionCall && allowedTools.includes(functionCall.name)) {
          const toolResult = await executeScopedTool(functionCall.name, functionCall.args || {}, user);
          const followup = await requestGemini([
            { role: 'user', parts: [{ text: message }] },
            { role: 'model', parts: firstParts },
            { role: 'user', parts: [{ functionResponse: { name: functionCall.name, response: { result: toolResult } } }] },
          ], false);
          if (followup.ok) {
            const answer = (await followup.json()).candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
            if (answer) return { reply: answer, toolCall: toolResult };
          }
          return { reply: JSON.stringify(toolResult.result ?? toolResult.error), toolCall: toolResult };
        }
        const answer = firstParts.map((part) => part.text || '').join('').trim();
        if (answer) return { reply: answer, toolCall: null };
      }
    } catch (llmErr) {
      console.warn('[AI Service] LLM call failed, using grounded fallback:', llmErr.message);
    }
  }

  // Default helpful grounded response
  return {
    reply: `Hello ${user.name}! I am your HCM Lite AI Assistant. You can ask me about company policies (office hours, grace periods, tax slabs, leave quotas), check your leave balance, search employees, or apply for leave in plain English (e.g. "Taking next Monday off for a wedding"). How can I help you today?`,
    toolCall: null,
  };
};

/**
 * AI Dashboard Summary: generates 3-5 concise bullet insights from KPI JSON
 */
export const generateDashboardSummary = async (kpiData) => {
  const attendanceRate = kpiData?.attendanceRate ?? 0;
  const latePct = kpiData?.latePercentage ?? 0;
  const totalEmployees = kpiData?.totalEmployees ?? 0;
  const pendingApprovals = kpiData?.pendingApprovals ?? 0;
  const payrollCost = kpiData?.monthlyPayrollCost ?? 0;

  const insights = [
    `Headcount is steady at **${totalEmployees} active personnel** across all operational departments.`,
    attendanceRate >= 90
      ? `Strong workforce punctuality with an overall attendance rate of **${attendanceRate}%** this month.`
      : `Attendance rate currently stands at **${attendanceRate}%**; punctuality reminders are recommended.`,
    latePct > 15
      ? `Late arrival rate is slightly elevated at **${latePct}%**; review morning grace periods and commuter routes.`
      : `Late comers are well controlled, accounting for only **${latePct}%** of total check-ins.`,
    pendingApprovals > 0
      ? `There are **${pendingApprovals} pending review request(s)** (leaves & corrections) awaiting HR review.`
      : `All employee leave and correction requests are completely up to date with zero backlog.`,
    payrollCost > 0
      ? `Estimated monthly payroll expenditure stands at **PKR ${payrollCost.toLocaleString()}**.`
      : `Monthly payroll draft has not been finalized yet for the current cycle.`,
  ];

  return {
    summary: insights,
    generatedAt: new Date().toISOString(),
  };
};

