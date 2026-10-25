import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      default: 'Saylani Enterprises',
      trim: true,
    },
    // Alias for compatibility
    name: {
      type: String,
      trim: true,
    },
    officeHours: {
      start: {
        type: String,
        default: '09:00',
      },
      end: {
        type: String,
        default: '18:00',
      },
      graceMinutes: {
        type: Number,
        default: 15,
      },
      halfDayHours: {
        type: Number,
        default: 5.0,
      },
    },
    // Aliases for compatibility
    workHours: {
      start: { type: String, default: '09:00' },
      end: { type: String, default: '18:00' },
    },
    gracePeriodMinutes: {
      type: Number,
      default: 15,
    },
    halfDayHoursThreshold: {
      type: Number,
      default: 5.0,
    },
    workWeek: {
      weekends: {
        type: [String],
        default: ['Saturday', 'Sunday'],
      },
    },
    leaveQuotas: {
      annual: {
        type: Number,
        default: 14,
      },
      sick: {
        type: Number,
        default: 8,
      },
      casual: {
        type: Number,
        default: 10,
      },
    },
    departments: {
      type: [String],
      default: ['Engineering', 'Human Resources', 'Finance', 'Operations', 'Executive'],
    },
    designations: {
      type: [String],
      default: ['Director', 'HR Manager', 'Lead Engineer', 'Software Engineer', 'Associate'],
    },
    isConfigured: {
      type: Boolean,
      default: true,
    },
    setupCompletedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-validate hook taake validation run hone se pehle hi companyName sync ho jaye
organizationSchema.pre('validate', function (next) {
  if (this.name && !this.companyName) {
    this.companyName = this.name;
  }
  if (!this.companyName) {
    this.companyName = 'Saylani Enterprises';
  }
  if (this.companyName && !this.name) {
    this.name = this.companyName;
  }

  if (this.officeHours) {
    if (!this.workHours) this.workHours = {};
    if (this.officeHours.start) this.workHours.start = this.officeHours.start;
    if (this.officeHours.end) this.workHours.end = this.officeHours.end;
    if (this.officeHours.graceMinutes !== undefined) {
      this.gracePeriodMinutes = this.officeHours.graceMinutes;
    }
    if (this.officeHours.halfDayHours !== undefined) {
      this.halfDayHoursThreshold = this.officeHours.halfDayHours;
    }
  }
  next();
});

export const Organization =
  mongoose.models.Organization || mongoose.model('Organization', organizationSchema);

export const Company =
  mongoose.models.Company || mongoose.model('Company', organizationSchema);
