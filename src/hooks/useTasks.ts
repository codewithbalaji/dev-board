import * as React from "react";

import { apiFetch } from "@/api/client";

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  assigneeId: string | null;
  createdBy: string;
  dueAt: number | null;
  commentCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface UseTasksResult {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  createTask(input: { title: string; description?: string; priority?: TaskPriority }): Promise<Task>;
  moveTask(taskId: string, status: TaskStatus, position: number): void;
  updateTask(taskId: string, patch: Partial<Pick<Task, "title" | "description" | "priority" | "assigneeId" | "dueAt">>): void;
  deleteTask(taskId: string): void;
  refetch(): Promise<void>;
}

interface UseTasksOptions {
  onMutationError?: (message: string, retry: () => void) => void;
}

export function useTasks(projectId: string | null, options: UseTasksOptions = {}): UseTasksResult {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { onMutationError } = options;

  const refetch = React.useCallback(async () => {
    if (!projectId) {
      setTasks([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ tasks: Task[] }>(`/api/projects/${projectId}/tasks`);
      setTasks(data.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    void refetch();
  }, [refetch]);

  const createTask = React.useCallback(
    async (input: { title: string; description?: string; priority?: TaskPriority }) => {
      if (!projectId) throw new Error("No project selected");
      const data = await apiFetch<{ task: Task }>(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      setTasks((prev) => [...prev, data.task]);
      return data.task;
    },
    [projectId],
  );

  // Function declarations (not useCallback consts) so the retry closure below
  // can call the mutator by name without a temporal-dead-zone self-reference.
  function moveTask(taskId: string, status: TaskStatus, position: number) {
    const previous = tasks.find((t) => t.id === taskId);
    if (!previous) return;

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status, position } : t)));

    apiFetch<{ task: Task }>(`/api/tasks/${taskId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, position }),
    })
      .then((data) => {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));
      })
      .catch((err) => {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? previous : t)));
        const message = err instanceof Error ? err.message : "Couldn't move the task.";
        onMutationError?.(message, () => moveTask(taskId, status, position));
      });
  }

  function updateTask(
    taskId: string,
    patch: Partial<Pick<Task, "title" | "description" | "priority" | "assigneeId" | "dueAt">>,
  ) {
    const previous = tasks.find((t) => t.id === taskId);
    if (!previous) return;

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));

    apiFetch<{ task: Task }>(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((data) => {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));
      })
      .catch((err) => {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? previous : t)));
        const message = err instanceof Error ? err.message : "Couldn't save the change.";
        onMutationError?.(message, () => updateTask(taskId, patch));
      });
  }

  function deleteTask(taskId: string) {
    const previous = tasks.find((t) => t.id === taskId);
    if (!previous) return;

    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    apiFetch(`/api/tasks/${taskId}`, { method: "DELETE" }).catch((err) => {
      setTasks((prev) => [...prev, previous]);
      const message = err instanceof Error ? err.message : "Couldn't delete the task.";
      onMutationError?.(message, () => deleteTask(taskId));
    });
  }

  return { tasks, isLoading, error, createTask, moveTask, updateTask, deleteTask, refetch };
}
