import { Notification } from '../models/Notification.js';

export const createNotification = async ({
  userId,
  title,
  message,
  type = 'system',
  link = '',
}) => {
  try {
    return await Notification.create({
      userId,
      title,
      message,
      type,
      link,
    });
  } catch (err) {
    console.error('[Notification Error]', err);
    return null;
  }
};

