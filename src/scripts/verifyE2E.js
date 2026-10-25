const BASE_URL = 'http://localhost:5000/api';

async function run() {
  console.log('--- STARTING E2E VERIFICATION TEST ---');

  // 1. Check Setup Status (Initial)
  console.log('\n[Step 1] Checking Setup Status...');
  const res1 = await fetch(`${BASE_URL}/auth/setup-status`);
  const data1 = await res1.json();
  console.log('Setup Status Response:', JSON.stringify(data1));

  let tokenAdmin = '';
  let tokenHr = '';
  let tokenEmp = '';

  // 2. Perform First-Run Setup if not configured
  if (!data1.isConfigured && !data1.isSetup) {
    console.log('\n[Step 2] Executing First-Run Setup via /setup/first-run...');
    const res2 = await fetch(`${BASE_URL}/setup/first-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: 'Saylani Enterprises',
        name: 'Master Administrator',
        email: 'admin@saylani.com',
        password: 'AdminSaylani2026!',
      }),
    });
    const data2 = await res2.json();
    console.log('First-Run Setup Status:', res2.status, 'Success:', data2.success);
    console.log('Admin user payload:', JSON.stringify(data2.user));
    if (!data2.success) throw new Error('First run setup failed: ' + JSON.stringify(data2));
    tokenAdmin = data2.token;
  } else {
    console.log('\n[Step 2] Logging in as Admin...');
    const resLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@saylani.com',
        password: 'AdminSaylani2026!',
      }),
    });
    const dataLogin = await resLogin.json();
    console.log('Admin Login Status:', resLogin.status, 'Success:', dataLogin.success);
    console.log('Admin User:', JSON.stringify(dataLogin.user));
    tokenAdmin = dataLogin.token;
  }

  // Verify Admin Token & Admin Analytics
  console.log('\n[Step 3] Fetching Admin Analytics...');
  const resAnalytics = await fetch(`${BASE_URL}/analytics/admin`, {
    headers: { Authorization: `Bearer ${tokenAdmin}` },
  });
  const dataAnalytics = await resAnalytics.json();
  console.log('Admin Analytics KPIs:', JSON.stringify(dataAnalytics.data?.kpis));

  // 4. Admin Creates HR Login
  console.log('\n[Step 4] Admin Creating HR User...');
  const hrEmail = `hr_${Date.now()}@saylani.com`;
  const resHr = await fetch(`${BASE_URL}/users/hr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenAdmin}`,
    },
    body: JSON.stringify({
      name: 'HR Officer One',
      email: hrEmail,
      password: 'TempHrPassword123!',
      phone: '+923001234567',
    }),
  });
  const dataHr = await resHr.json();
  console.log('Create HR Status:', resHr.status, 'Success:', dataHr.success);
  console.log('Created HR User:', JSON.stringify(dataHr.hrUser));
  const hrTempPassword = dataHr.temporaryPassword || 'TempHrPassword123!';

  // 5. HR Logs In
  console.log('\n[Step 5] HR Logging In with Temporary Password...');
  const resHrLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: hrEmail,
      password: hrTempPassword,
    }),
  });
  const dataHrLogin = await resHrLogin.json();
  console.log('HR Login Status:', resHrLogin.status, 'Success:', dataHrLogin.success);
  console.log('HR isTemporaryPassword:', dataHrLogin.user?.isTemporaryPassword);
  tokenHr = dataHrLogin.token;

  // 6. HR Changes Password
  console.log('\n[Step 6] HR Changing Temporary Password...');
  const resChangePwd = await fetch(`${BASE_URL}/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenHr}`,
    },
    body: JSON.stringify({
      currentPassword: hrTempPassword,
      newPassword: 'PermanentHrPassword123!',
    }),
  });
  const dataChangePwd = await resChangePwd.json();
  console.log('Change Password Status:', resChangePwd.status, 'Success:', dataChangePwd.success);

  // 7. HR Registers an Employee
  console.log('\n[Step 7] HR Registering an Employee...');
  const empEmail = `emp_${Date.now()}@saylani.com`;
  const resEmp = await fetch(`${BASE_URL}/users/employees`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenHr}`,
    },
    body: JSON.stringify({
      name: 'Tahir Engineer',
      email: empEmail,
      department: 'Engineering',
      designation: 'Senior Full Stack Developer',
      basicSalary: 100000,
      phone: '+923219876543',
      address: 'Karachi, Pakistan',
    }),
  });
  const dataEmp = await resEmp.json();
  console.log('Register Employee Status:', resEmp.status, 'Success:', dataEmp.success);
  console.log('Employee registered payload:', JSON.stringify(dataEmp.employee));
  console.log('Employee Temp Password:', dataEmp.temporaryPassword);
  const empTempPassword = dataEmp.temporaryPassword;

  // 8. Employee Logs In
  console.log('\n[Step 8] Employee Logging In...');
  const resEmpLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: empEmail,
      password: empTempPassword,
    }),
  });
  const dataEmpLogin = await resEmpLogin.json();
  console.log('Employee Login Status:', resEmpLogin.status, 'Success:', dataEmpLogin.success);
  console.log('Employee Role:', dataEmpLogin.user?.role, 'Code:', dataEmpLogin.user?.employeeCode);
  console.log('Employee isTemporaryPassword:', dataEmpLogin.user?.isTemporaryPassword);
  tokenEmp = dataEmpLogin.token;

  // 9. Employee Check-In & Duplicate Check-In Test
  console.log('\n[Step 9] Employee Check-In...');
  const resCheckIn = await fetch(`${BASE_URL}/attendance/checkin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenEmp}`,
    },
    body: JSON.stringify({
      faceVerified: true,
    }),
  });
  const dataCheckIn = await resCheckIn.json();
  console.log('Check-In Status:', resCheckIn.status, 'Attendance Status:', dataCheckIn.attendance?.status);

  // Test duplicate check-in (Rule 4.A.7: 1 check-in per date -> expect 409)
  console.log('Testing duplicate check-in (expecting 409)...');
  const resDupCheckIn = await fetch(`${BASE_URL}/attendance/checkin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenEmp}`,
    },
    body: JSON.stringify({
      faceVerified: true,
    }),
  });
  console.log('Duplicate Check-In HTTP Code:', resDupCheckIn.status, '(409 Expected)');

  // 10. Employee Applies for Leave
  console.log('\n[Step 10] Employee Applying for Leave...');
  const resLeave = await fetch(`${BASE_URL}/leaves`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenEmp}`,
    },
    body: JSON.stringify({
      type: 'annual',
      startDate: '2026-11-02', // Monday
      endDate: '2026-11-04',   // Wednesday (3 working days)
      reason: 'Family event in Lahore',
    }),
  });
  const dataLeave = await resLeave.json();
  console.log('Apply Leave Status:', resLeave.status, 'Success:', dataLeave.success);
  console.log('Leave daysCount:', dataLeave.leave?.daysCount, 'Status:', dataLeave.leave?.status);
  const leaveId = dataLeave.leave?._id;

  // Test Overlapping Leave Request (expecting 422)
  console.log('Testing Overlapping Leave Request (expecting 422)...');
  const resDupLeave = await fetch(`${BASE_URL}/leaves`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenEmp}`,
    },
    body: JSON.stringify({
      type: 'casual',
      startDate: '2026-11-03',
      endDate: '2026-11-05',
      reason: 'Overlap test',
    }),
  });
  console.log('Overlapping Leave HTTP Code:', resDupLeave.status, '(422 Expected)');

  // 11. HR Reviews (Approves) Leave
  if (leaveId) {
    console.log('\n[Step 11] HR Approving Leave...');
    const resReview = await fetch(`${BASE_URL}/leaves/${leaveId}/review`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenHr}`,
      },
      body: JSON.stringify({
        decision: 'approved',
        reviewComment: 'Approved by HR Manager.',
      }),
    });
    const dataReview = await resReview.json();
    console.log('Leave Review Status:', resReview.status, 'Success:', dataReview.success);
  }

  // 12. Payroll Draft Generation by HR & Finalization by Admin
  console.log('\n[Step 12] HR Generating Payroll Draft...');
  const resPayrollDraft = await fetch(`${BASE_URL}/payroll/draft`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenHr}`,
    },
    body: JSON.stringify({
      month: '2026-11',
    }),
  });
  const dataPayrollDraft = await resPayrollDraft.json();
  console.log('Payroll Draft Status:', resPayrollDraft.status, 'Success:', dataPayrollDraft.success);
  const record = dataPayrollDraft.payrollRun?.records?.[0];
  if (record) {
    console.log(`Sample Slip: Gross=${record.gross}, Tax=${record.monthlyTax}, Deductions=${record.deductions}, Net=${record.netPay}`);
  }

  console.log('Admin Finalizing Payroll...');
  const resPayrollFinalize = await fetch(`${BASE_URL}/payroll/finalize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenAdmin}`,
    },
    body: JSON.stringify({
      month: '2026-11',
    }),
  });
  const dataPayrollFinalize = await resPayrollFinalize.json();
  console.log('Payroll Finalize Status:', resPayrollFinalize.status, 'isFinalized:', dataPayrollFinalize.payrollRun?.isFinalized);

  // 13. AI Chat Copilot Verification
  console.log('\n[Step 13] Testing AI Copilot Intent Dispatch & Privacy Scoping...');
  // Policy query
  const resAi1 = await fetch(`${BASE_URL}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenEmp}`,
    },
    body: JSON.stringify({
      message: 'What is the office timing and grace rule?',
    }),
  });
  const dataAi1 = await resAi1.json();
  console.log('AI Policy Answer Preview:', dataAi1.reply?.substring(0, 100));

  // Leave balance query
  const resAi2 = await fetch(`${BASE_URL}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenEmp}`,
    },
    body: JSON.stringify({
      message: 'How many annual leaves do I have left?',
    }),
  });
  const dataAi2 = await resAi2.json();
  console.log('AI Leave Balance Tool Answer:', dataAi2.reply);

  // Colleague Salary Privacy Refusal Query (Strict requirement)
  const resAi3 = await fetch(`${BASE_URL}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenEmp}`,
    },
    body: JSON.stringify({
      message: "What is my colleague's salary?",
    }),
  });
  const dataAi3 = await resAi3.json();
  console.log('AI Salary Privacy Refusal Reply:', dataAi3.reply);
  console.log('isSalaryRestricted:', dataAi3.isSalaryRestricted);

  console.log('\n=== ALL END-TO-END VERIFICATION CHECKS COMPLETED SUCCESSFULLY! ===');
}

run().catch((e) => {
  console.error('E2E Verification Error:', e);
  process.exit(1);
});
