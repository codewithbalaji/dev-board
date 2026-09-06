export interface Env {
  ENVIRONMENT: "development" | "staging" | "production";
  DB: D1Database;
  BUCKET: R2Bucket;
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
}
