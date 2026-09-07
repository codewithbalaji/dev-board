// Every KV key is built here — never inline a template literal at a call
// site. One typo in a purge path silently leaves a stale cache forever.
export const cacheKeys = {
  projectStats: (projectId: string) => `cache:project:stats:${projectId}`,
  userProjects: (userId: string) => `cache:user:projects:${userId}`,
  rateLimit: (scope: string, identifier: string, window: number) =>
    `ratelimit:${scope}:${identifier}:${window}`,
} as const;

export const configKeys = {
  announcements: "config:announcements",
  maintenanceMode: "config:maintenance_mode",
  featureFlags: "config:feature_flags",
} as const;
