import mongoose from 'mongoose';

const designationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
      default: '',
    },
    level: {
      type: String,
      enum: ['Junior', 'Mid', 'Senior', 'Lead', 'Executive'],
      default: 'Mid',
    },
  },
  {
    timestamps: true,
  }
);

export const Designation = mongoose.models.Designation || mongoose.model('Designation', designationSchema);

