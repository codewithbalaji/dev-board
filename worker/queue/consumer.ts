import type { Env } from "../env";
import type { ActivityMessage } from "../lib/activity";
import { broadcastToProject } from "../lib/broadcast";
import { toApiActivity, type ActivityRow } from "../routes/activities";

// Whole-batch atomicity via db.batch() means per-message ack() would lie about
// which messages actually landed — ackAll/retryAll only, never ack() per item.
export async function handleActivityBatch(batch: MessageBatch<ActivityMessage>, env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const ids = batch.messages.map(() => crypto.randomUUID());

  const statements = batch.messages.map((m, i) =>
    env.DB.prepare(
      `INSERT INTO activities
         (id, project_id, actor_id, type, entity_type, entity_id, payload, occurred_at, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      ids[i],
      m.body.projectId,
      m.body.actorId,
      m.body.type,
      m.body.entityType,
      m.body.entityId ?? null,
      JSON.stringify(m.body.payload ?? {}),
      m.body.occurredAt,
      now,
    ),
  );

  try {
    await env.DB.batch(statements);
    batch.ackAll();
  } catch (err) {
    // Rolled back as a whole — retry the batch rather than acking partial work.
    batch.retryAll({ delaySeconds: 10 });
    throw err;
  }

  for (let i = 0; i < batch.messages.length; i++) {
    const m = batch.messages[i];
    const row: ActivityRow = {
      id: ids[i],
      project_id: m.body.projectId,
      actor_id: m.body.actorId,
      type: m.body.type,
      entity_type: m.body.entityType,
      entity_id: m.body.entityId ?? null,
      payload: JSON.stringify(m.body.payload ?? {}),
      occurred_at: m.body.occurredAt,
      processed_at: now,
    };
    await broadcastToProject(env, m.body.projectId, { type: "activity.created", activity: toApiActivity(row) });
  }
}
