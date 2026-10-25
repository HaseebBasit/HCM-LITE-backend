import jwt from 'jsonwebtoken';
import { Company } from '../models/Company.js';
import { User } from '../models/User.js';
import { ENV } from '../config/env.js';
import { logAudit } from '../services/auditService.js';

const formatUserPayload = (user, company) => {
  const companyObj = company
    ? {
        id: company._id,
        name: company.name || company.companyName,
        companyName: company.companyName || company.name,
        officeHours: {
          start: company.officeHours?.start || company.workHours?.start || '09:00',
          end: company.officeHours?.end || company.workHours?.end || '18:00',
          graceMinutes: company.officeHours?.graceMinutes ?? company.gracePeriodMinutes ?? 15,
          halfDayHours: company.officeHours?.halfDayHours ?? company.halfDayHoursThreshold ?? 5,
        },
      }
    : null;

  return {
    id: user._id,
    _id: user._id,
    name: user.name,
    email: user.email,
    role: String(user.role || 'employee').toLowerCase(),
    employeeCode: user.employeeCode || user.employeeId || 'EMP-001',
    employeeId: user.employeeId || user.employeeCode || 'EMP-001',
    department: user.department || 'General',
    designation: user.designation || 'Staff',
    phone: user.phone || '',
    address: user.address || '',
    isTemporaryPassword: Boolean(user.isTemporaryPassword ?? user.mustChangePassword ?? false),
    mustChangePassword: Boolean(user.mustChangePassword ?? user.isTemporaryPassword ?? false),
    salary: user.salary || { basic: 0, allowances: 0, gross: 0 },
    leaveBalances: user.leaveBalances || { annual: 14, sick: 8, casual: 10 },
    company: companyObj,
  };
};

export const getSetupStatus = async (req, res, next) => {
  try {
    let companyCount = 0;
    let adminCount = 0;
    let company = null;

    try {
      companyCount = await Company.countDocuments();
      adminCount = await User.countDocuments({ role: { $in: ['admin', 'Admin'] } });
      if (companyCount > 0 && adminCount > 0) {
        company = await Company.findOne().select('name companyName workHours officeHours leaveQuotas');
      }
    } catch (dbErr) {
      console.warn('[Setup Status] Database query note:', dbErr.message);
    }

    const isSetup = companyCount > 0 && adminCount > 0;

    return res.status(200).json({
      success: true,
      isConfigured: isSetup,
      isSetup,
      company: isSetup ? company : null,
    });
  } catch (error) {
    return res.status(200).json({
      success: true,
      isConfigured: false,
      isSetup: false,
      company: null,
    });
  }
};

export const firstRunSetup = async (req, res, next) => {
  try {
    const {
      companyName = 'Saylani Enterprises',
      workStart = '09:00',
      workEnd = '18:00',
      gracePeriodMinutes = 15,
      halfDayHoursThreshold = 5.0,
      annualLeaveQuota = 14,
      sickLeaveQuota = 8,
      casualLeaveQuota = 10,
      adminName,
      adminEmail,
      adminPassword,
      name,
      email,
      password,
    } = req.body;

    const alreadyInitialized = await User.exists({ role: { $in: ['Admin', 'admin'] } });
    if (alreadyInitialized) {
      return res.status(409).json({ success: false, message: 'Initial setup has already been completed.' });
    }

    const finalCompanyName = (companyName || name || 'Saylani Enterprises').trim();
    const targetEmail = (email || adminEmail || ENV.ADMIN_EMAIL || '').trim().toLowerCase();
    const targetPassword = password || adminPassword || ENV.ADMIN_PASSWORD || '';
    const targetAdminName = (name || adminName || 'Master Administrator').trim();
    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      return res.status(422).json({ success: false, message: 'Enter a valid primary admin email address.' });
    }
    if (targetPassword.length < 12) {
      return res.status(422).json({ success: false, message: 'The primary admin password must be at least 12 characters.' });
    }

    // 1. Create or Update Organization
    let company = await Company.findOne();
    if (company) {
      company.companyName = finalCompanyName;
      company.name = finalCompanyName;
      company.officeHours = {
        start: workStart,
        end: workEnd,
        graceMinutes: Number(gracePeriodMinutes),
        halfDayHours: Number(halfDayHoursThreshold),
      };
      company.workHours = { start: workStart, end: workEnd };
      company.gracePeriodMinutes = Number(gracePeriodMinutes);
      company.halfDayHoursThreshold = Number(halfDayHoursThreshold);
      company.leaveQuotas = {
        annual: Number(annualLeaveQuota),
        sick: Number(sickLeaveQuota),
        casual: Number(casualLeaveQuota),
      };
      company.isConfigured = true;
      await company.save();
    } else {
      company = await Company.create({
        companyName: finalCompanyName,
        name: finalCompanyName,
        officeHours: {
          start: workStart,
          end: workEnd,
          graceMinutes: Number(gracePeriodMinutes),
          halfDayHours: Number(halfDayHoursThreshold),
        },
        workHours: { start: workStart, end: workEnd },
        gracePeriodMinutes: Number(gracePeriodMinutes),
        halfDayHoursThreshold: Number(halfDayHoursThreshold),
        workWeek: { weekends: ['Saturday', 'Sunday'] },
        leaveQuotas: {
          annual: Number(annualLeaveQuota),
          sick: Number(sickLeaveQuota),
          casual: Number(casualLeaveQuota),
        },
        departments: ['Executive', 'Human Resources', 'Engineering', 'Finance', 'Operations'],
        designations: ['Managing Director', 'HR Manager', 'Lead Engineer', 'Senior Accountant', 'Staff'],
        isConfigured: true,
      });
    }

    // 2. Create or Update Master Admin User
    let adminUser = await User.findOne({ email: targetEmail });
    if (!adminUser) {
      adminUser = await User.findOne({ role: { $in: ['admin', 'Admin'] } });
    }

    if (adminUser) {
      adminUser.organization = company._id;
      adminUser.name = targetAdminName;
      adminUser.email = targetEmail;
      adminUser.password = targetPassword;
      adminUser.role = 'Admin';
      adminUser.employeeCode = 'ADM-001';
      adminUser.employeeId = 'ADM-001';
      adminUser.department = 'Executive';
      adminUser.designation = 'Managing Director';
      adminUser.isTemporaryPassword = false;
      adminUser.mustChangePassword = false;
      adminUser.isActive = true;
      adminUser.leaveBalances = {
        annual: Number(annualLeaveQuota),
        sick: Number(sickLeaveQuota),
        casual: Number(casualLeaveQuota),
      };
      await adminUser.save();
    } else {
      adminUser = await User.create({
        organization: company._id,
        name: targetAdminName,
        email: targetEmail,
        password: targetPassword,
        role: 'Admin',
        employeeCode: 'ADM-001',
        employeeId: 'ADM-001',
        department: 'Executive',
        designation: 'Managing Director',
        isTemporaryPassword: false,
        mustChangePassword: false,
        isActive: true,
        leaveBalances: {
          annual: Number(annualLeaveQuota),
          sick: Number(sickLeaveQuota),
          casual: Number(casualLeaveQuota),
        },
      });
    }

    // 3. Issue JWT
    const token = jwt.sign(
      { id: adminUser._id, role: adminUser.role, email: adminUser.email },
      ENV.JWT_SECRET,
      { expiresIn: ENV.JWT_EXPIRES_IN }
    );

    // 4. Log Audit
    try {
      await logAudit({
        req,
        action: 'FIRST_RUN_SETUP',
        entity: 'Company',
        entityId: company._id,
        after: { companyName: company.name, adminEmail: adminUser.email },
        actor: adminUser,
      });
    } catch (auditErr) {
      console.warn('[Audit Log Warning]:', auditErr.message);
    }

    const formattedUser = formatUserPayload(adminUser, company);

    return res.status(201).json({
      success: true,
      message: 'Setup configured successfully! Organization and Master Admin ready.',
      token,
      user: formattedUser,
      company: formattedUser.company,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact your administrator.',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email },
      ENV.JWT_SECRET,
      { expiresIn: ENV.JWT_EXPIRES_IN }
    );

    try {
      await logAudit({
        req,
        action: 'USER_LOGIN',
        entity: 'User',
        entityId: user._id,
        actor: user,
      });
    } catch (auditErr) {
      console.warn('[Audit Log Warning]:', auditErr.message);
    }

    let company = null;
    if (user.organization) {
      company = await Company.findById(user.organization);
    }
    if (!company) {
      company = await Company.findOne();
    }

    const formattedUser = formatUserPayload(user, company);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: formattedUser,
      company: formattedUser.company,
    });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof newPassword !== 'string' || newPassword.length < 12) {
      return res.status(422).json({
        success: false,
        message: 'New password must be at least 12 characters long.',
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (!user.mustChangePassword && !currentPassword) {
      return res.status(422).json({ success: false, message: 'Current password is required.' });
    }

    if (currentPassword) {
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect.',
        });
      }
    }

    user.password = newPassword;
    user.isTemporaryPassword = false;
    user.mustChangePassword = false;
    await user.save();

    try {
      await logAudit({
        req,
        action: 'CHANGE_PASSWORD',
        entity: 'User',
        entityId: user._id,
        actor: user,
      });
    } catch (auditErr) {
      console.warn('[Audit Log Warning]:', auditErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export const register = async (req, res, next) => {
  try {
    if (!req.user || !['admin', 'hr'].includes(String(req.user.role || '').toLowerCase())) {
      return res.status(403).json({ success: false, message: 'Only an administrator or HR can create employee accounts.' });
    }

    const {
      name,
      email,
      password,
      department = 'Engineering',
      designation = 'Staff',
      phone = '',
      basicSalary = 60000,
      companyName = 'Saylani Enterprises',
    } = req.body;

    if (!name || !email || !password) {
      return res.status(422).json({
        success: false,
        message: 'Full Name, Work Email, and Password are required.',
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email address is already registered.',
      });
    }

    let company = await Company.findOne();
    if (!company) {
      company = await Company.create({
        name: (companyName || 'Saylani Enterprises').trim(),
        companyName: (companyName || 'Saylani Enterprises').trim(),
        workHours: { start: '09:00', end: '18:00' },
        gracePeriodMinutes: 15,
        halfDayHoursThreshold: 5.0,
        leaveQuotas: { annual: 14, sick: 8, casual: 10 },
        isConfigured: true,
      });
    }

    // Account creation through this endpoint is limited to employee accounts.
    const assignedRole = 'Employee';

    const count = await User.countDocuments({ role: assignedRole });
    const prefix = String(assignedRole).toLowerCase() === 'admin' ? 'ADM' : String(assignedRole).toLowerCase() === 'hr' ? 'HR' : 'EMP';
    const employeeId = `${prefix}-${String(count + 1).padStart(3, '0')}`;

    const basic = Number(basicSalary) || 60000;
    const hra = Math.round(basic * 0.4);
    const medical = Math.round(basic * 0.1);
    const gross = Math.round(basic * 1.5);

    const quotas = company?.leaveQuotas || { annual: 14, sick: 8, casual: 10 };

    const newUser = await User.create({
      organization: company._id,
      name: name.trim(),
      email: cleanEmail,
      password,
      role: assignedRole,
      employeeCode: employeeId,
      employeeId,
      department: department || 'Engineering',
      designation: designation || (prefix === 'ADM' ? 'Executive Director' : prefix === 'HR' ? 'HR Officer' : 'Software Engineer'),
      phone: phone || '',
      isTemporaryPassword: false,
      mustChangePassword: false,
      isActive: true,
      salary: {
        basic,
        hra,
        medical,
        gross,
      },
      leaveBalances: {
        annual: quotas.annual,
        sick: quotas.sick,
        casual: quotas.casual,
      },
    });

    const token = jwt.sign(
      { id: newUser._id, role: newUser.role, email: newUser.email },
      ENV.JWT_SECRET,
      { expiresIn: ENV.JWT_EXPIRES_IN }
    );

    try {
      await logAudit({
        req,
        action: 'USER_REGISTER',
        entity: 'User',
        entityId: newUser._id,
        after: { name: newUser.name, email: newUser.email, role: newUser.role },
        actor: newUser,
      });
    } catch (auditErr) {
      console.warn('[Audit Log Warning]:', auditErr.message);
    }

    const formattedUser = formatUserPayload(newUser, company);

    return res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      token,
      user: formattedUser,
      company: formattedUser.company,
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let company = null;
    if (user.organization) {
      company = await Company.findById(user.organization);
    }
    if (!company) {
      company = await Company.findOne();
    }

    const formattedUser = formatUserPayload(user, company);

    return res.status(200).json({
      success: true,
      user: formattedUser,
      company: formattedUser.company,
    });
  } catch (error) {
    next(error);
  }
};
