import { Announcement } from '../models/Announcement.js';
import { logAudit } from '../services/auditService.js';

export const getAnnouncements = async (req, res, next) => {
  try {
    const list = await Announcement.find().sort({ createdAt: -1 }).limit(20);
    return res.status(200).json({ success: true, announcements: list });
  } catch (error) {
    next(error);
  }
};

export const createAnnouncement = async (req, res, next) => {
  try {
    const { title, content, priority = 'normal' } = req.body;
    if (!title || !content) {
      return res.status(422).json({ success: false, message: 'Title and Content are required.' });
    }

    const item = await Announcement.create({
      title: title.trim(),
      content: content.trim(),
      priority,
      authorId: req.user._id,
      authorName: req.user.name,
      authorRole: req.user.role,
    });

    await logAudit({
      req,
      action: 'CREATE_ANNOUNCEMENT',
      entity: 'Announcement',
      entityId: item._id,
      after: { title: item.title, priority: item.priority },
    });

    return res.status(201).json({
      success: true,
      message: 'Announcement published successfully.',
      announcement: item,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAnnouncement = async (req, res, next) => {
  try {
    const item = await Announcement.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Announcement not found.' });

    await logAudit({
      req,
      action: 'DELETE_ANNOUNCEMENT',
      entity: 'Announcement',
      entityId: item._id,
      before: item.toObject(),
    });

    return res.status(200).json({ success: true, message: 'Announcement deleted.' });
  } catch (error) {
    next(error);
  }
};

