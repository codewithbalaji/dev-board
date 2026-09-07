import type { Env } from "../env";
import type { toApiComment, toApiTask } from "../routes/tasks";

type ApiTask = ReturnType<typeof toApiTask>;
type ApiComment = ReturnType<typeof toApiComment>;

export type BroadcastMessage =
  | { type: "task.upserted"; task: ApiTask; mutationId?: string }
  | { type: "task.deleted"; taskId: string; projectId: string; mutationId?: string }
  | { type: "comment.upserted"; comment: ApiComment; mutationId?: string }
  | { type: "comment.deleted"; commentId: string; taskId: string; mutationId?: string }
  | { type: "presence"; members: { userId: string; displayName: string }[] };

// Realtime is an enhancement, never a precondition — a DO outage must never
// fail the mutating request that already committed to D1. Mirrors
// cacheAside's degrade-don't-fail shape.
export async function broadcastToProject(
  env: Env,
  projectId: string,
  payload: BroadcastMessage,
): Promise<void> {
  try {
    const stub = env.REALTIME_BOARD.get(env.REALTIME_BOARD.idFromName(projectId));
    await stub.fetch("https://do/broadcast", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("broadcast failed", { projectId, type: payload.type, error: String(err) });
  }
}
