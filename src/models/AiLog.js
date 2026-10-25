import mongoose from 'mongoose';

const aiLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, required: true },
  message: { type: String, required: true, maxlength: 2000 },
  reply: { type: String, default: '' },
  tool: { type: String, default: '' },
  outcome: { type: String, enum: ['success', 'error', 'restricted'], default: 'success' },
}, { timestamps: true, collection: 'ai_logs' });

aiLogSchema.index({ user: 1, createdAt: -1 });

export const AiLog = mongoose.models.AiLog || mongoose.model('AiLog', aiLogSchema);
