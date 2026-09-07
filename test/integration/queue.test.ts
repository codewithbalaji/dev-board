import { describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { apiRequest, authHeader, makeBatch, seedProject, seedUser } from "../helpers";
import { handleActivityBatch } from "../../worker/queue/consumer";
import type { ActivityMessage } from "../../worker/lib/activity";

function jsonBody(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}

describe("activity producers", () => {
  it("enqueues task.created on task creation", async () => {
    const owner = await seedUser("q-owner1@example.com");
    const { projectId } = await seedProject(owner.id);
    const sent: ActivityMessage[] = [];
    const spy = vi.spyOn(env.ACTIVITY_QUEUE, "send").mockImplementation(async (m) => {
      sent.push(m as ActivityMessage);
    });

    await apiRequest(
      `/api/projects/${projectId}/tasks`,
      { ...jsonBody("POST", { title: "New task" }), headers: { ...authHeader(owner), "content-type": "application/json" } },
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "task.created", projectId, actorId: owner.id, entityType: "task" });
    expect(sent[0].occurredAt).toBeTypeOf("number");
    spy.mockRestore();
  });

  it("enqueues task.status_changed with from/to on status change", async () => {
    const owner = await seedUser("q-owner2@example.com");
    const { projectId, taskId } = await seedProject(owner.id);
    const sent: ActivityMessage[] = [];
    const spy = vi.spyOn(env.ACTIVITY_QUEUE, "send").mockImplementation(async (m) => {
      sent.push(m as ActivityMessage);
    });

    await apiRequest(`/api/tasks/${taskId}/status`, {
      ...jsonBody("PATCH", { status: "done", position: 1000 }),
      headers: { ...authHeader(owner), "content-type": "application/json" },
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "task.status_changed",
      projectId,
      payload: { from: "todo", to: "done" },
    });
    spy.mockRestore();
  });

  it("enqueues task.deleted, comment.created, and project.member_added", async () => {
    const owner = await seedUser("q-owner3@example.com");
    const { projectId, taskId } = await seedProject(owner.id);
    const sent: ActivityMessage[] = [];
    const spy = vi.spyOn(env.ACTIVITY_QUEUE, "send").mockImplementation(async (m) => {
      sent.push(m as ActivityMessage);
    });

    await apiRequest(`/api/tasks/${taskId}/comments`, {
      ...jsonBody("POST", { body: "hello" }),
      headers: { ...authHeader(owner), "content-type": "application/json" },
    });
    await apiRequest(`/api/tasks/${taskId}`, {
      ...jsonBody("DELETE"),
      headers: authHeader(owner),
    });

    const types = sent.map((m) => m.type);
    expect(types).toContain("comment.created");
    expect(types).toContain("task.deleted");
    spy.mockRestore();
  });
});

describe("handleActivityBatch", () => {
  it("batch-inserts every message and acks once", async () => {
    const owner = await seedUser("q-owner4@example.com");
    const { projectId } = await seedProject(owner.id);
    const batch = makeBatch([
      { type: "task.created", projectId, actorId: owner.id, entityType: "task", entityId: "t1", occurredAt: 1000 },
      { type: "comment.created", projectId, actorId: owner.id, entityType: "comment", entityId: "c1", occurredAt: 1001 },
    ]);

    await handleActivityBatch(batch, env);

    const { results } = await env.DB.prepare("SELECT * FROM activities WHERE project_id = ? ORDER BY occurred_at")
      .bind(projectId)
      .all<{ occurred_at: number; processed_at: number }>();
    expect(results).toHaveLength(2);
    expect(results[0].processed_at).toBeGreaterThanOrEqual(results[0].occurred_at);
    expect(batch.ackAll).toHaveBeenCalledOnce();
    expect(batch.retryAll).not.toHaveBeenCalled();
  });

  it("retries the whole batch when the D1 write fails, without acking", async () => {
    const owner = await seedUser("q-owner5@example.com");
    const { projectId } = await seedProject(owner.id);
    const spy = vi.spyOn(env.DB, "batch").mockRejectedValue(new Error("D1 down"));
    const batch = makeBatch([{ type: "task.created", projectId, actorId: owner.id, occurredAt: 1000 }]);

    await expect(handleActivityBatch(batch, env)).rejects.toThrow();
    expect(batch.retryAll).toHaveBeenCalled();
    expect(batch.ackAll).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
