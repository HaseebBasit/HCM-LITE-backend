import { Company } from '../models/Company.js';
import { logAudit } from '../services/auditService.js';

export const getCompany = async (req, res, next) => {
  try {
    let company = await Company.findOne();
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company settings not found. Run setup first.' });
    }
    return res.status(200).json({ success: true, company });
  } catch (error) {
    next(error);
  }
};

export const updateCompany = async (req, res, next) => {
  try {
    let company = await Company.findOne();
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company settings not found.' });
    }

    const before = company.toObject();
    const {
      name,
      workHours,
      gracePeriodMinutes,
      halfDayHoursThreshold,
      leaveQuotas,
    } = req.body;

    if (name) company.name = name.trim();
    if (workHours) {
      if (workHours.start) company.workHours.start = workHours.start;
      if (workHours.end) company.workHours.end = workHours.end;
    }
    if (gracePeriodMinutes !== undefined) company.gracePeriodMinutes = Number(gracePeriodMinutes);
    if (halfDayHoursThreshold !== undefined) company.halfDayHoursThreshold = Number(halfDayHoursThreshold);
    if (leaveQuotas) {
      if (leaveQuotas.annual !== undefined) company.leaveQuotas.annual = Number(leaveQuotas.annual);
      if (leaveQuotas.sick !== undefined) company.leaveQuotas.sick = Number(leaveQuotas.sick);
      if (leaveQuotas.casual !== undefined) company.leaveQuotas.casual = Number(leaveQuotas.casual);
    }

    await company.save();

    await logAudit({
      req,
      action: 'UPDATE_COMPANY_SETTINGS',
      entity: 'Company',
      entityId: company._id,
      before,
      after: company.toObject(),
    });

    return res.status(200).json({
      success: true,
      message: 'Company settings updated successfully.',
      company,
    });
  } catch (error) {
    next(error);
  }
};

