import { Department } from '../models/Department.js';
import { Designation } from '../models/Designation.js';
import { Holiday } from '../models/Holiday.js';
import { logAudit } from '../services/auditService.js';

// Departments
export const getDepartments = async (req, res, next) => {
  try {
    const list = await Department.find().sort({ name: 1 });
    return res.status(200).json({ success: true, departments: list });
  } catch (error) {
    next(error);
  }
};

export const createDepartment = async (req, res, next) => {
  try {
    const { name, code, description } = req.body;
    if (!name) return res.status(422).json({ success: false, message: 'Department name is required' });

    const exists = await Department.findOne({ name: name.trim() });
    if (exists) return res.status(409).json({ success: false, message: 'Department already exists' });

    const dept = await Department.create({ name: name.trim(), code: code?.trim(), description });
    await logAudit({ req, action: 'CREATE_DEPARTMENT', entity: 'Department', entityId: dept._id, after: dept });
    return res.status(201).json({ success: true, department: dept });
  } catch (error) {
    next(error);
  }
};

export const deleteDepartment = async (req, res, next) => {
  try {
    const dept = await Department.findByIdAndDelete(req.params.id);
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });
    await logAudit({ req, action: 'DELETE_DEPARTMENT', entity: 'Department', entityId: dept._id, before: dept });
    return res.status(200).json({ success: true, message: 'Department deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Designations
export const getDesignations = async (req, res, next) => {
  try {
    const list = await Designation.find().sort({ title: 1 });
    return res.status(200).json({ success: true, designations: list });
  } catch (error) {
    next(error);
  }
};

export const createDesignation = async (req, res, next) => {
  try {
    const { title, department, level } = req.body;
    if (!title) return res.status(422).json({ success: false, message: 'Designation title is required' });

    const desig = await Designation.create({ title: title.trim(), department: department?.trim(), level });
    await logAudit({ req, action: 'CREATE_DESIGNATION', entity: 'Designation', entityId: desig._id, after: desig });
    return res.status(201).json({ success: true, designation: desig });
  } catch (error) {
    next(error);
  }
};

export const deleteDesignation = async (req, res, next) => {
  try {
    const desig = await Designation.findByIdAndDelete(req.params.id);
    if (!desig) return res.status(404).json({ success: false, message: 'Designation not found' });
    await logAudit({ req, action: 'DELETE_DESIGNATION', entity: 'Designation', entityId: desig._id, before: desig });
    return res.status(200).json({ success: true, message: 'Designation deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Holidays
export const getHolidays = async (req, res, next) => {
  try {
    const list = await Holiday.find().sort({ date: 1 });
    return res.status(200).json({ success: true, holidays: list });
  } catch (error) {
    next(error);
  }
};

export const createHoliday = async (req, res, next) => {
  try {
    const { title, date, description } = req.body;
    if (!title || !date) return res.status(422).json({ success: false, message: 'Title and Date are required' });

    const holiday = await Holiday.create({ title: title.trim(), date: date.trim(), description });
    await logAudit({ req, action: 'CREATE_HOLIDAY', entity: 'Holiday', entityId: holiday._id, after: holiday });
    return res.status(201).json({ success: true, holiday });
  } catch (error) {
    next(error);
  }
};

export const deleteHoliday = async (req, res, next) => {
  try {
    const holiday = await Holiday.findByIdAndDelete(req.params.id);
    if (!holiday) return res.status(404).json({ success: false, message: 'Holiday not found' });
    await logAudit({ req, action: 'DELETE_HOLIDAY', entity: 'Holiday', entityId: holiday._id, before: holiday });
    return res.status(200).json({ success: true, message: 'Holiday deleted successfully' });
  } catch (error) {
    next(error);
  }
};

