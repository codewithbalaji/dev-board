import * as React from "react";

import { apiFetch } from "@/api/client";

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  ownerId: string;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
  memberCount?: number;
}

export interface UseProjectsResult {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  createProject(input: { name: string; description?: string }): Promise<Project>;
  refetch(): Promise<void>;
}

export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refetch = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ projects: Project[] }>("/api/projects");
      setProjects(data.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refetch();
  }, [refetch]);

  const createProject = React.useCallback(async (input: { name: string; description?: string }) => {
    const data = await apiFetch<{ project: Project }>("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    setProjects((prev) => [data.project, ...prev]);
    return data.project;
  }, []);

  return { projects, isLoading, error, createProject, refetch };
}
