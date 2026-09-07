// Kept out of env.ts and queue/consumer.ts to avoid a circular import — both
// of those, plus every producer route, need this type.
export type ActivityType =
  | "task.created"
  | "task.updated"
  | "task.status_changed"
  | "task.deleted"
  | "comment.created"
  | "attachment.uploaded"
  | "attachment.deleted"
  | "project.member_added";

export interface ActivityMessage {
  type: ActivityType;
  projectId: string;
  actorId: string | null;
  entityType: "project" | "task" | "comment" | "attachment";
  entityId: string | null;
  payload: Record<string, unknown>;
  occurredAt: number;
}
