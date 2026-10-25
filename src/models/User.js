import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
      set: (val) => {
        if (!val) return 'Employee';
        const lower = String(val).toLowerCase();
        if (lower === 'admin') return 'Admin';
        if (lower === 'hr') return 'HR';
        return 'Employee';
      },
      enum: ['Admin', 'HR', 'Employee', 'admin', 'hr', 'employee'],
    },
    employeeCode: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    employeeId: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    department: {
      type: String,
      trim: true,
      default: 'General',
    },
    designation: {
      type: String,
      trim: true,
      default: 'Staff',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    isTemporaryPassword: {
      type: Boolean,
      default: false,
    },
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    salary: {
      basic: { type: Number, default: 0 },
      allowances: { type: Number, default: 0 },
      hra: { type: Number, default: 0 },
      medical: { type: Number, default: 0 },
      gross: { type: Number, default: 0 },
    },
    leaveBalances: {
      annual: { type: Number, default: 14 },
      sick: { type: Number, default: 8 },
      casual: { type: Number, default: 10 },
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    exitDate: {
      type: Date,
      default: null,
    },
    facePhotoUrl: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Synchronize employeeCode and employeeId, isTemporaryPassword and mustChangePassword
userSchema.pre('save', async function (next) {
  if (this.employeeCode && !this.employeeId) this.employeeId = this.employeeCode;
  if (this.employeeId && !this.employeeCode) this.employeeCode = this.employeeId;

  if (this.isTemporaryPassword !== undefined) this.mustChangePassword = this.isTemporaryPassword;
  if (this.mustChangePassword !== undefined && this.isTemporaryPassword === undefined) {
    this.isTemporaryPassword = this.mustChangePassword;
  }

  // Ensure salary allowances and gross are synchronized
  if (this.salary && this.salary.basic) {
    const basic = Number(this.salary.basic) || 0;
    const hra = Math.round(basic * 0.4);
    const medical = Math.round(basic * 0.1);
    this.salary.hra = hra;
    this.salary.medical = medical;
    this.salary.allowances = hra + medical;
    this.salary.gross = Math.round(basic * 1.5);
  }

  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

// Middleware to normalize role in query filters so searches match case-insensitively
const normalizeRoleFilter = function () {
  const filter = this.getFilter();
  if (filter && filter.role) {
    if (typeof filter.role === 'string') {
      const lower = filter.role.toLowerCase();
      if (lower === 'admin') filter.role = { $in: ['Admin', 'admin'] };
      else if (lower === 'hr') filter.role = { $in: ['HR', 'hr'] };
      else if (lower === 'employee') filter.role = { $in: ['Employee', 'employee'] };
    }
  }
};

userSchema.pre('find', normalizeRoleFilter);
userSchema.pre('findOne', normalizeRoleFilter);
userSchema.pre('countDocuments', normalizeRoleFilter);
userSchema.pre('findOneAndUpdate', normalizeRoleFilter);

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.models.User || mongoose.model('User', userSchema);
