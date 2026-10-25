import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Alias for compatibility
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
      index: true,
    },
    checkIn: {
      type: Date,
      default: null,
    },
    checkOut: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['present', 'late', 'half_day', 'absent', 'on_leave', 'missing_checkout', 'holiday', 'leave'],
      default: 'present',
    },
    workHours: {
      type: Number,
      default: 0,
    },
    isMissingCheckout: {
      type: Boolean,
      default: false,
    },
    faceVerified: {
      type: Boolean,
      default: false,
    },
    facePhotoUrl: {
      type: String,
      default: '',
    },
    correctionRequest: {
      hasRequest: {
        type: Boolean,
        default: false,
      },
      requestedCheckIn: Date,
      requestedCheckOut: Date,
      reason: String,
      status: {
        type: String,
        enum: ['none', 'pending', 'approved', 'rejected'],
        default: 'none',
      },
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      reviewComment: String,
      reviewedAt: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Synchronize employee and userId
attendanceSchema.pre('validate', function (next) {
  if (this.employee && !this.userId) this.userId = this.employee;
  if (this.userId && !this.employee) this.employee = this.userId;
  next();
});

// Enforce Exactly 1 check-in per calendar date per employee
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

export const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
