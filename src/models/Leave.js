import mongoose from 'mongoose';

const leaveSchema = new mongoose.Schema(
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
    leaveType: {
      type: String,
      enum: ['annual', 'sick', 'casual', 'unpaid'],
      required: true,
    },
    // Alias for compatibility
    type: {
      type: String,
      enum: ['annual', 'sick', 'casual', 'unpaid'],
    },
    startDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    endDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    daysCount: {
      type: Number,
      required: true,
      min: 1,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    approverComment: {
      type: String,
      default: '',
    },
    reviewComment: {
      type: String,
      default: '',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

leaveSchema.pre('validate', function (next) {
  if (this.employee && !this.userId) this.userId = this.employee;
  if (this.userId && !this.employee) this.employee = this.userId;

  if (this.leaveType && !this.type) this.type = this.leaveType;
  if (this.type && !this.leaveType) this.leaveType = this.type;

  if (this.approverComment && !this.reviewComment) this.reviewComment = this.approverComment;
  if (this.reviewComment && !this.approverComment) this.approverComment = this.reviewComment;

  if (this.approvedBy && !this.reviewedBy) this.reviewedBy = this.approvedBy;
  if (this.reviewedBy && !this.approvedBy) this.approvedBy = this.reviewedBy;

  next();
});

export const Leave = mongoose.models.Leave || mongoose.model('Leave', leaveSchema);
