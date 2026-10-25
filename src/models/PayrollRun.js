import mongoose from 'mongoose';

const payrollRecordSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  employeeName: String,
  employeeCode: String,
  employeeId: String,
  department: String,
  designation: String,
  basic: Number,
  allowances: Number,
  hra: Number,
  medical: Number,
  gross: Number,
  contractGross: Number,
  eligibleWorkingDays: Number,
  dailyRate: Number,
  absentDays: Number,
  unpaidLeaveDays: Number,
  halfDays: Number,
  deductions: Number,
  annualGross: Number,
  annualTax: Number,
  monthlyTax: Number,
  netPay: Number,
});

payrollRecordSchema.pre('validate', function (next) {
  if (this.employee && !this.userId) this.userId = this.employee;
  if (this.userId && !this.employee) this.employee = this.userId;

  if (this.employeeCode && !this.employeeId) this.employeeId = this.employeeCode;
  if (this.employeeId && !this.employeeCode) this.employeeCode = this.employeeId;
  next();
});

const payrollRunSchema = new mongoose.Schema(
  {
    month: {
      type: String, // YYYY-MM
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'finalized'],
      default: 'draft',
    },
    isFinalized: {
      type: Boolean,
      default: false,
    },
    preparedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    finalizedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    finalizedAt: {
      type: Date,
    },
    totalWorkingDays: {
      type: Number,
      required: true,
    },
    totalPayrollCost: {
      type: Number,
      default: 0,
    },
    totalGross: {
      type: Number,
      default: 0,
    },
    totalDeductions: {
      type: Number,
      default: 0,
    },
    totalTax: {
      type: Number,
      default: 0,
    },
    totalNetPaid: {
      type: Number,
      default: 0,
    },
    totalNet: {
      type: Number,
      default: 0,
    },
    slips: [payrollRecordSchema],
    records: [payrollRecordSchema],
  },
  {
    timestamps: true,
  }
);

payrollRunSchema.pre('validate', function (next) {
  if (this.slips && this.slips.length > 0 && (!this.records || this.records.length === 0)) {
    this.records = this.slips;
  }
  if (this.records && this.records.length > 0 && (!this.slips || this.slips.length === 0)) {
    this.slips = this.records;
  }

  if (this.totalPayrollCost && !this.totalGross) this.totalGross = this.totalPayrollCost;
  if (this.totalGross && !this.totalPayrollCost) this.totalPayrollCost = this.totalGross;

  if (this.totalNetPaid && !this.totalNet) this.totalNet = this.totalNetPaid;
  if (this.totalNet && !this.totalNetPaid) this.totalNetPaid = this.totalNet;

  if (this.status === 'finalized') {
    this.isFinalized = true;
  }
  next();
});

export const PayrollRun = mongoose.models.PayrollRun || mongoose.model('PayrollRun', payrollRunSchema);
