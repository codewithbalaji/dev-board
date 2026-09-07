import * as React from "react";

import { apiFetch } from "@/api/client";
import type { EntityMessage } from "./useRealtime";

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface UseCommentsResult {
  comments: Comment[];
  isLoading: boolean;
  postComment(body: string): Promise<void>;
}

interface UseCommentsOptions {
  subscribe?: (handler: (message: EntityMessage) => void) => () => void;
}

export function useComments(taskId: string | null, options: UseCommentsOptions = {}): UseCommentsResult {
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const { subscribe } = options;

  // See useTasks.ts for why in-flight mutation ids are tracked this way.
  const ownMutationIds = React.useRef(new Set<string>());

  React.useEffect(() => {
    if (!subscribe) return;
    return subscribe((message: EntityMessage) => {
      if (message.mutationId && ownMutationIds.current.delete(message.mutationId)) return;

      if (message.type === "comment.upserted" && message.comment.taskId === taskId) {
        setComments((prev) => {
          const existing = prev.find((c) => c.id === message.comment.id);
          if (existing && existing.updatedAt >= message.comment.updatedAt) return prev;
          if (!existing) return [...prev, message.comment];
          return prev.map((c) => (c.id === message.comment.id ? message.comment : c));
        });
      } else if (message.type === "comment.deleted" && message.taskId === taskId) {
        setComments((prev) => prev.filter((c) => c.id !== message.commentId));
      }
    });
  }, [subscribe, taskId]);

  React.useEffect(() => {
    if (!taskId) {
      setComments([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    apiFetch<{ comments: Comment[] }>(`/api/tasks/${taskId}/comments`)
      .then((data) => setComments(data.comments))
      .finally(() => setIsLoading(false));
  }, [taskId]);

  const postComment = React.useCallback(
    async (body: string) => {
      if (!taskId) return;
      // Optimistic append at reduced opacity — TaskCommentRow renders this
      // pending flag as 60% opacity until the real row replaces it.
      const pendingId = `pending-${crypto.randomUUID()}`;
      const optimistic: Comment = {
        id: pendingId,
        taskId,
        authorId: "",
        body,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      };
      setComments((prev) => [...prev, optimistic]);
      const mutationId = crypto.randomUUID();
      ownMutationIds.current.add(mutationId);
      try {
        const data = await apiFetch<{ comment: Comment }>(`/api/tasks/${taskId}/comments`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body, mutationId }),
        });
        setComments((prev) => prev.map((c) => (c.id === pendingId ? data.comment : c)));
      } catch {
        setComments((prev) => prev.filter((c) => c.id !== pendingId));
      }
    },
    [taskId],
  );

  return { comments, isLoading, postComment };
}
