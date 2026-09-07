import type { RealtimeBoard } from "./durable-objects/RealtimeBoard";
import type { ActivityMessage } from "./lib/activity";

export interface Env {
  ENVIRONMENT: "development" | "staging" | "production";
  DB: D1Database;
  BUCKET: R2Bucket;
  KV: KVNamespace;
  REALTIME_BOARD: DurableObjectNamespace<RealtimeBoard>;
  ACTIVITY_QUEUE: Queue<ActivityMessage>;
  JWT_SECRET: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface Variables {
  requestStart: number;
  user: AuthUser;
  cacheStatus: "HIT" | "MISS" | "BYPASS";
}
