import { AuditLog } from '../models/AuditLog.js';

export const logAudit = async ({
  req,
  action,
  entity,
  entityId = '',
  before = null,
  after = null,
  actor = null,
}) => {
  try {
    const currentActor = actor || req?.user;
    const ipAddress =
      req?.headers['x-forwarded-for']?.split(',')[0] ||
      req?.socket?.remoteAddress ||
      req?.ip ||
      '';
    const userAgent = req?.headers['user-agent'] || '';

    await AuditLog.create({
      actorId: currentActor?._id || null,
      actorName: currentActor?.name || 'System / First Run',
      actorEmail: currentActor?.email || 'system@saylani.com',
      actorRole: currentActor?.role || 'system',
      action,
      entity,
      entityId: String(entityId || ''),
      before: before ? JSON.parse(JSON.stringify(before)) : null,
      after: after ? JSON.parse(JSON.stringify(after)) : null,
      ipAddress,
      userAgent,
    });
  } catch (err) {
    console.error('[Audit Log Error]', err);
  }
};

