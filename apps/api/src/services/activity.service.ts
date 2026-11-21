import type { ActivityMetadata, ActivityType } from '@chiane/shared';
import type { DbClient } from './balance.service';

export interface LogActivityInput {
  groupId: string;
  actorMemberId?: string | null;
  type: ActivityType;
  title: string;
  subtitle: string;
  metadata?: ActivityMetadata;
}

export async function logActivity(db: DbClient, input: LogActivityInput) {
  return db.activityLog.create({
    data: {
      groupId: input.groupId,
      actorMemberId: input.actorMemberId ?? null,
      type: input.type,
      title: input.title,
      subtitle: input.subtitle,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}

export function parseActivityMetadata(raw?: string | null): ActivityMetadata | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ActivityMetadata;
  } catch {
    return null;
  }
}
