import crypto from 'crypto';
import { User } from '../models/User.js';
import { Company } from '../models/Company.js';
import { Attendance } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';
import { AuditLog } from '../models/AuditLog.js';
import { logAudit } from '../services/auditService.js';
import { Department } from '../models/Department.js';

// ==================== HR LOGINS (ADMIN ONLY) ====================
export const getHrUsers = async (req, res, next) => {
  try {
    const hrUsers = await User.find({ role: { $in: ['HR', 'hr'] } }).select('-password').sort({ createdAt: -1 });
    return res.status(200).json({ success: true, hrUsers });
  } catch (error) {
    next(error);
  }
};

export const createHrUser = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email) {
      return res.status(422).json({ success: false, message: 'Name and email are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({ success: false, message: 'User with this email already exists.' });
    }

    const company = await Company.findOne();
    const hrCount = await User.countDocuments({ role: { $in: ['HR', 'hr'] } });
    const employeeCode = `HR-${String(hrCount + 1).padStart(3, '0')}`;
    if (password && password.trim().length < 12) {
      return res.status(422).json({ success: false, message: 'Password must be at least 12 characters.' });
    }
    const tempPassword = password && password.trim() ? password.trim() : crypto.randomBytes(15).toString('base64url');

    const hrUser = await User.create({
      organization: company?._id,
      name: name.trim(),
      email: cleanEmail,
      password: tempPassword,
      role: 'HR',
      employeeCode,
      employeeId: employeeCode,
      department: 'Human Resources',
      designation: 'HR Officer',
      phone: phone || '',
      isTemporaryPassword: true,
      mustChangePassword: true,
      isActive: true,
    });

    await logAudit({
      req,
      action: 'CREATE_HR_USER',
      entity: 'User',
      entityId: hrUser._id,
      after: { name: hrUser.name, email: hrUser.email, employeeCode },
    });

    return res.status(201).json({
      success: true,
      message: 'HR account created successfully.',
      hrUser: {
        id: hrUser._id,
        name: hrUser.name,
        email: hrUser.email,
        role: hrUser.role,
        employeeCode: hrUser.employeeCode,
        employeeId: hrUser.employeeId,
        isActive: hrUser.isActive,
        isTemporaryPassword: hrUser.isTemporaryPassword,
        mustChangePassword: hrUser.mustChangePassword,
      },
      temporaryPassword: tempPassword,
      tempPassword: tempPassword,
    });
  } catch (error) {
    next(error);
  }
};

export const toggleHrStatus = async (req, res, next) => {
  try {
    const hrUser = await User.findOne({ _id: req.params.id, role: { $in: ['HR', 'hr'] } });
    if (!hrUser) return res.status(404).json({ success: false, message: 'HR user not found.' });

    hrUser.isActive = !hrUser.isActive;
    await hrUser.save();

    await logAudit({
      req,
      action: hrUser.isActive ? 'ACTIVATE_HR_USER' : 'DEACTIVATE_HR_USER',
      entity: 'User',
      entityId: hrUser._id,
      after: { isActive: hrUser.isActive },
    });

    return res.status(200).json({
      success: true,
      message: `HR user ${hrUser.isActive ? 'activated' : 'deactivated'} successfully.`,
      hrUser,
    });
  } catch (error) {
    next(error);
  }
};

export const resetHrPassword = async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    if (typeof newPassword !== 'string' || newPassword.length < 12) {
      return res.status(422).json({ success: false, message: 'New password must be at least 12 characters.' });
    }

    const hrUser = await User.findOne({ _id: req.params.id, role: { $in: ['HR', 'hr'] } });
    if (!hrUser) return res.status(404).json({ success: false, message: 'HR user not found.' });

    hrUser.password = newPassword;
    hrUser.isTemporaryPassword = true;
    hrUser.mustChangePassword = true;
    await hrUser.save();

    await logAudit({
      req,
      action: 'RESET_HR_PASSWORD',
      entity: 'User',
      entityId: hrUser._id,
    });

    return res.status(200).json({ success: true, message: 'HR password reset successfully.' });
  } catch (error) {
    next(error);
  }
};

// ==================== EMPLOYEE MANAGEMENT ====================
export const getEmployees = async (req, res, next) => {
  try {
    const { search, department, status, page = 1, limit = 20 } = req.query;
    const query = { role: 'employee' };

    const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));

    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;

    if (department && department !== 'All') {
      query.department = department;
    }

    if (search) {
      const escapedSearch = String(search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: new RegExp(escapedSearch, 'i') },
        { email: new RegExp(escapedSearch, 'i') },
        { employeeId: new RegExp(escapedSearch, 'i') },
      ];
    }

    const skip = (pageNumber - 1) * pageSize;
    const total = await User.countDocuments(query);
    const employees = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize);

    return res.status(200).json({
      success: true,
      total,
      page: pageNumber,
      totalPages: Math.ceil(total / pageSize),
      employees,
    });
  } catch (error) {
    next(error);
  }
};

export const registerEmployee = async (req, res, next) => {
  try {
    const {
      name,
      email,
      department,
      designation,
      phone,
      address,
      basicSalary = 0,
      joiningDate,
      password,
    } = req.body;

    if (!name || !email) {
      return res.status(422).json({ success: false, message: 'Name and email are required.' });
    }

    if (!Number.isFinite(Number(basicSalary)) || Number(basicSalary) <= 0) {
      return res.status(422).json({ success: false, message: 'Basic salary must be greater than zero.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({ success: false, message: 'User with this email already registered.' });
    }

    // Auto-generate employee ID
    const count = await User.countDocuments({ role: { $in: ['Employee', 'employee'] } });
    const employeeCode = `EMP-${String(count + 1).padStart(3, '0')}`;

    // Generate temporary password or use provided
    if (password && password.trim().length < 12) {
      return res.status(422).json({ success: false, message: 'Password must be at least 12 characters.' });
    }
    const tempPassword = password && password.trim() ? password.trim() : crypto.randomBytes(15).toString('base64url');

    // Calculate initial salary structure
    const basic = Number(basicSalary) || 0;
    const hra = Math.round(basic * 0.4);
    const medical = Math.round(basic * 0.1);
    const allowances = hra + medical;
    const gross = Math.round(basic * 1.5);

    // Get company default leave quotas
    const company = await Company.findOne();
    const quotas = company?.leaveQuotas || { annual: 14, sick: 8, casual: 10 };

    const employee = await User.create({
      organization: company?._id,
      name: name.trim(),
      email: cleanEmail,
      password: tempPassword,
      role: 'Employee',
      employeeCode,
      employeeId: employeeCode,
      department: department || 'Engineering',
      designation: designation || 'Associate Engineer',
      phone: phone || '',
      address: address || '',
      isTemporaryPassword: true,
      mustChangePassword: true, // Rule: mustChangePassword: true on first employee sign-in
      isActive: true,
      salary: {
        basic,
        allowances,
        hra,
        medical,
        gross,
      },
      leaveBalances: {
        annual: quotas.annual,
        sick: quotas.sick,
        casual: quotas.casual,
      },
      joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
    });

    await logAudit({
      req,
      action: 'REGISTER_EMPLOYEE',
      entity: 'User',
      entityId: employee._id,
      after: {
        name: employee.name,
        email: employee.email,
        employeeCode: employee.employeeCode,
        grossSalary: gross,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Employee registered successfully.',
      employee: {
        id: employee._id,
        name: employee.name,
        email: employee.email,
        employeeCode: employee.employeeCode,
        employeeId: employee.employeeId,
        department: employee.department,
        designation: employee.designation,
        salary: employee.salary,
        isTemporaryPassword: employee.isTemporaryPassword,
        mustChangePassword: employee.mustChangePassword,
      },
      temporaryPassword: tempPassword,
      tempPassword: tempPassword,
    });
  } catch (error) {
    next(error);
  }
};

// ==================== EMPLOYEE 360 VIEW ====================
export const getEmployee360 = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check data scoping: Employee can only view own 360
    if (String(req.user.role || '').toLowerCase() === 'employee' && req.user._id.toString() !== id) {
      return res.status(403).json({ success: false, message: 'Forbidden: You can only view your own 360 profile.' });
    }

    const employee = await User.findById(id).select('-password');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    // Recent attendances (last 30 days)
    const attendances = await Attendance.find({ userId: id })
      .sort({ date: -1 })
      .limit(30);

    // Leaves
    const leaves = await Leave.find({ userId: id })
      .sort({ createdAt: -1 })
      .limit(20);

    // Audit logs relating to this employee
    const auditLogs = await AuditLog.find({ entityId: id })
      .sort({ createdAt: -1 })
      .limit(20);

    return res.status(200).json({
      success: true,
      employee,
      attendances,
      leaves,
      auditLogs,
    });
  } catch (error) {
    next(error);
  }
};

export const updateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const employee = await User.findById(id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const before = employee.toObject();

    // If caller is employee, they can only update their own phone and address
    if (String(req.user.role || '').toLowerCase() === 'employee') {
      if (req.user._id.toString() !== id) {
        return res.status(403).json({ success: false, message: 'Forbidden: You can only update your own details.' });
      }
      if (req.body.phone !== undefined) employee.phone = req.body.phone;
      if (req.body.address !== undefined) employee.address = req.body.address;
      await employee.save();

      return res.status(200).json({ success: true, message: 'Profile updated successfully.', employee });
    }

    // HR and Admin can update department, designation, salary, active status
    const { name, department, designation, phone, address, basicSalary, isActive } = req.body;
    if (name) employee.name = name.trim();
    if (department) employee.department = department.trim();
    if (designation) employee.designation = designation.trim();
    if (phone !== undefined) employee.phone = phone;
    if (address !== undefined) employee.address = address;
    if (isActive !== undefined) employee.isActive = Boolean(isActive);

    if (basicSalary !== undefined) {
      const basic = Number(basicSalary) || 0;
      employee.salary = {
        basic,
        hra: Math.round(basic * 0.4),
        medical: Math.round(basic * 0.1),
        gross: Math.round(basic * 1.5),
      };
    }

    await employee.save();

    await logAudit({
      req,
      action: 'UPDATE_EMPLOYEE',
      entity: 'User',
      entityId: employee._id,
      before,
      after: employee.toObject(),
    });

    return res.status(200).json({ success: true, message: 'Employee updated successfully.', employee });
  } catch (error) {
    next(error);
  }
};

// ==================== CSV DRY RUN & COMMIT & EXPORT ====================
export const csvDryRun = async (req, res, next) => {
  try {
    const { rows } = req.body; // Array of row objects [{ name, email, department, designation, phone, basicSalary }]
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 1000) {
      return res.status(422).json({ success: false, message: 'CSV validation must contain between 1 and 1,000 rows.' });
    }

    const report = {
      totalRows: rows.length,
      validRows: 0,
      invalidRows: 0,
      errors: [],
      preview: [],
    };

    const emailCandidates = rows.map((r) => String(r.email || '').trim().toLowerCase()).filter(Boolean);
    const codeCandidates = rows.map((r) => String(r.employeeCode || r.employeeId || '').trim()).filter(Boolean);
    const [existingUsers, departments, company] = await Promise.all([
      User.find({ $or: [{ email: { $in: emailCandidates } }, { employeeCode: { $in: codeCandidates } }, { employeeId: { $in: codeCandidates } }] }).select('email employeeCode employeeId'),
      Department.find().select('name'),
      Company.findOne().select('departments'),
    ]);
    const existingEmailSet = new Set(existingUsers.map((u) => u.email));
    const existingCodeSet = new Set(existingUsers.flatMap((u) => [u.employeeCode, u.employeeId]).filter(Boolean));
    const validDepartments = new Set([
      ...(company?.departments || []),
      ...departments.map((department) => department.name),
    ].map((name) => String(name).trim().toLowerCase()));
    const seenEmails = new Set();
    const seenCodes = new Set();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      const rowErrors = [];
      const addError = (field, reason) => rowErrors.push({ row: rowNum, field, reason });

      if (!row.name || !row.name.trim()) {
        addError('name', 'Name is required.');
      }

      const email = row.email?.toLowerCase().trim();
      if (!email) {
        addError('email', 'Email is required.');
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        addError('email', 'Enter a valid email address.');
      } else if (seenEmails.has(email)) {
        addError('email', 'Email is duplicated in this file.');
      } else if (existingEmailSet.has(email)) {
        addError('email', 'Email is already registered.');
      } else {
        seenEmails.add(email);
      }

      const employeeCode = String(row.employeeCode || row.employeeId || '').trim();
      if (employeeCode && (seenCodes.has(employeeCode.toLowerCase()) || existingCodeSet.has(employeeCode))) {
        addError('employeeCode', 'Employee code is already in use.');
      } else if (employeeCode) {
        seenCodes.add(employeeCode.toLowerCase());
      }
      const department = String(row.department || '').trim();
      if (!department) addError('department', 'Department is required.');
      else if (!validDepartments.has(department.toLowerCase())) addError('department', `Department "${department}" does not exist.`);

      const salaryValue = row.basicSalary ?? row.salary;
      const basic = Number(salaryValue);
      if (!Number.isFinite(basic) || basic <= 0) addError('basicSalary', 'Basic salary must be greater than zero.');

      const joiningDate = row.joiningDate == null || row.joiningDate === '' ? '' : String(row.joiningDate).trim();
      if (joiningDate && (!/^\d{4}-\d{2}-\d{2}$/.test(joiningDate) || Number.isNaN(Date.parse(`${joiningDate}T00:00:00Z`)))) {
        addError('joiningDate', 'Joining date must use the ISO YYYY-MM-DD format.');
      }

      if (rowErrors.length > 0) {
        report.invalidRows++;
        report.errors.push(...rowErrors);
      } else {
        report.validRows++;
        report.preview.push({
          row: rowNum,
          name: row.name.trim(),
          email,
          employeeCode: employeeCode || undefined,
          department,
          designation: row.designation?.trim() || 'Staff',
          phone: row.phone?.trim() || '',
          joiningDate: joiningDate || undefined,
          basicSalary: basic,
          grossSalary: Math.round(basic * 1.5),
        });
      }
    }

    return res.status(200).json({ success: true, report });
  } catch (error) {
    next(error);
  }
};

export const csvCommit = async (req, res, next) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 1000) {
      return res.status(422).json({ success: false, message: 'CSV import must contain between 1 and 1,000 rows.' });
    }

    const [company, departments, existingUsers] = await Promise.all([
      Company.findOne().select('departments leaveQuotas'),
      Department.find().select('name'),
      User.find({ $or: [
        { email: { $in: rows.map((r) => String(r.email || '').trim().toLowerCase()) } },
        { employeeCode: { $in: rows.map((r) => String(r.employeeCode || '').trim()).filter(Boolean) } },
        { employeeId: { $in: rows.map((r) => String(r.employeeCode || '').trim()).filter(Boolean) } },
      ] }).select('email employeeCode employeeId'),
    ]);
    const knownDepartments = new Set([...(company?.departments || []), ...departments.map((d) => d.name)].map((name) => String(name).toLowerCase()));
    const usedEmails = new Set(existingUsers.map((u) => u.email));
    const usedCodes = new Set(existingUsers.flatMap((u) => [u.employeeCode, u.employeeId]).filter(Boolean));
    const errors = [];
    rows.forEach((row, index) => {
      const rowNumber = index + 1;
      const email = String(row.email || '').trim().toLowerCase();
      const code = String(row.employeeCode || row.employeeId || '').trim();
      if (!row.name?.trim()) errors.push({ row: rowNumber, field: 'name', reason: 'Name is required.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ row: rowNumber, field: 'email', reason: 'Enter a valid email address.' });
      else if (usedEmails.has(email)) errors.push({ row: rowNumber, field: 'email', reason: 'Email is already in use.' });
      else usedEmails.add(email);
      if (code && usedCodes.has(code)) errors.push({ row: rowNumber, field: 'employeeCode', reason: 'Employee code is already in use.' });
      if (code) usedCodes.add(code);
      if (!knownDepartments.has(String(row.department || '').trim().toLowerCase())) errors.push({ row: rowNumber, field: 'department', reason: 'Department does not exist.' });
      if (!Number.isFinite(Number(row.basicSalary)) || Number(row.basicSalary) <= 0) errors.push({ row: rowNumber, field: 'basicSalary', reason: 'Basic salary must be greater than zero.' });
      if (row.joiningDate && (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.joiningDate)) || Number.isNaN(Date.parse(`${row.joiningDate}T00:00:00Z`)))) errors.push({ row: rowNumber, field: 'joiningDate', reason: 'Joining date must use ISO YYYY-MM-DD format.' });
    });
    if (errors.length) return res.status(422).json({ success: false, message: 'CSV rows changed or became invalid. Run validation again.', errors });

    const quotas = company?.leaveQuotas || { annual: 14, sick: 8, casual: 10 };

    let currentEmpCount = await User.countDocuments({ role: 'employee' });
    const inserted = [];

    for (const r of rows) {
      currentEmpCount++;
      const employeeId = r.employeeCode || r.employeeId || `EMP-${String(currentEmpCount).padStart(3, '0')}`;
      const tempPassword = crypto.randomBytes(15).toString('base64url');
      const basic = Number(r.basicSalary) || 50000;

      const user = await User.create({
        name: r.name.trim(),
        email: r.email.toLowerCase().trim(),
        password: tempPassword,
        role: 'employee',
        employeeId,
        department: r.department || 'General',
        designation: r.designation || 'Staff',
        phone: r.phone || '',
        joiningDate: r.joiningDate ? new Date(`${r.joiningDate}T00:00:00Z`) : new Date(),
        mustChangePassword: true,
        isActive: true,
        salary: {
          basic,
          hra: Math.round(basic * 0.4),
          medical: Math.round(basic * 0.1),
          gross: Math.round(basic * 1.5),
        },
        leaveBalances: {
          annual: quotas.annual,
          sick: quotas.sick,
          casual: quotas.casual,
        },
      });

      inserted.push({
        id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        temporaryPassword: tempPassword,
      });
    }

    await logAudit({
      req,
      action: 'CSV_IMPORT_EMPLOYEES',
      entity: 'User',
      after: { count: inserted.length },
    });

    return res.status(201).json({
      success: true,
      message: `Successfully imported ${inserted.length} employee(s).`,
      imported: inserted,
    });
  } catch (error) {
    next(error);
  }
};

export const csvExport = async (req, res, next) => {
  try {
    const employees = await User.find({ role: 'employee' }).select('-password').sort({ employeeId: 1 });

    const header = ['Employee ID', 'Name', 'Email', 'Department', 'Designation', 'Phone', 'Basic Salary', 'Gross Salary', 'Status'];
    const rows = employees.map((e) => [
      `"${e.employeeId || ''}"`,
      `"${e.name || ''}"`,
      `"${e.email || ''}"`,
      `"${e.department || ''}"`,
      `"${e.designation || ''}"`,
      `"${e.phone || ''}"`,
      e.salary?.basic || 0,
      e.salary?.gross || 0,
      e.isActive ? 'Active' : 'Inactive',
    ]);

    const csvContent = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=employees_roster.csv');
    return res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
};

