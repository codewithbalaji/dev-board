import * as React from "react";

import { apiFetch } from "@/api/client";

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

export function useComments(taskId: string | null): UseCommentsResult {
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

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
      try {
        const data = await apiFetch<{ comment: Comment }>(`/api/tasks/${taskId}/comments`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
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
