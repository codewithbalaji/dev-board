import * as React from "react";

import { apiFetch } from "@/api/client";
import type { EntityMessage } from "./useRealtime";

export type ActivityType =
  | "task.created"
  | "task.updated"
  | "task.status_changed"
  | "task.deleted"
  | "comment.created"
  | "attachment.uploaded"
  | "attachment.deleted"
  | "project.member_added";

export interface Activity {
  id: string;
  projectId: string;
  actorId: string | null;
  type: ActivityType;
  entityType: "project" | "task" | "comment" | "attachment";
  entityId: string | null;
  payload: Record<string, unknown>;
  occurredAt: number;
  processedAt: number;
}

export interface UseActivitiesResult {
  activities: Activity[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore(): Promise<void>;
}

interface UseActivitiesOptions {
  subscribe?: (handler: (message: EntityMessage) => void) => () => void;
}

const PAGE_LIMIT = 50;

// Activities never render optimistically — the queue lag is a deliberate,
// visible feature (DESIGN.md §8), so every entry here came from either the
// initial D1 fetch or a live "activity.created" broadcast from the consumer.
export function useActivities(projectId: string | null, options: UseActivitiesOptions = {}): UseActivitiesResult {
  const [activities, setActivities] = React.useState<Activity[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const { subscribe } = options;

  React.useEffect(() => {
    if (!subscribe) return;
    return subscribe((message: EntityMessage) => {
      if (message.type === "activity.created" && message.activity.projectId === projectId) {
        setActivities((prev) => [message.activity, ...prev]);
      }
    });
  }, [subscribe, projectId]);

  React.useEffect(() => {
    if (!projectId) {
      setActivities([]);
      setNextCursor(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    apiFetch<{ activities: Activity[]; nextCursor: string | null }>(
      `/api/projects/${projectId}/activities?limit=${PAGE_LIMIT}`,
    )
      .then((data) => {
        setActivities(data.activities);
        setNextCursor(data.nextCursor);
      })
      .finally(() => setIsLoading(false));
  }, [projectId]);

  const loadMore = React.useCallback(async () => {
    if (!projectId || !nextCursor) return;
    const data = await apiFetch<{ activities: Activity[]; nextCursor: string | null }>(
      `/api/projects/${projectId}/activities?limit=${PAGE_LIMIT}&cursor=${encodeURIComponent(nextCursor)}`,
    );
    setActivities((prev) => [...prev, ...data.activities]);
    setNextCursor(data.nextCursor);
  }, [projectId, nextCursor]);

  return { activities, isLoading, hasMore: nextCursor !== null, loadMore };
}
