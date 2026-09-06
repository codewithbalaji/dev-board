import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { apiRequest, authHeader, seedMember, seedProject, seedUser } from "../helpers";

function uploadBody(name: string, type: string, bytes: Uint8Array): RequestInit {
  const form = new FormData();
  form.append("file", new File([bytes], name, { type }));
  return { method: "POST", body: form };
}

describe("GET /api/tasks/:id/attachments", () => {
  it("lists attachments, empty on a fresh task", async () => {
    const owner = await seedUser("a-owner1@example.com");
    const { taskId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/tasks/${taskId}/attachments`, { headers: authHeader(owner) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attachments).toEqual([]);
  });

  it("returns 404 to a non-member", async () => {
    const owner = await seedUser("a-owner2@example.com");
    const outsider = await seedUser("a-outsider2@example.com");
    const { taskId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/tasks/${taskId}/attachments`, { headers: authHeader(outsider) });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/tasks/:id/attachments", () => {
  it("uploads a file, storing bytes in R2 and metadata in D1", async () => {
    const owner = await seedUser("a-owner3@example.com");
    const { projectId, taskId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/tasks/${taskId}/attachments`, {
      ...uploadBody("notes.txt", "text/plain", new TextEncoder().encode("hello")),
      headers: authHeader(owner),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.attachment.filename).toBe("notes.txt");
    expect(body.attachment.size).toBe(5);
    expect(body.attachment.mimeType).toBe("text/plain");
    expect(body.attachment.fileKey).toBeUndefined();

    const row = await env.DB.prepare("SELECT file_key FROM attachments WHERE id = ?")
      .bind(body.attachment.id)
      .first<{ file_key: string }>();
    expect(row?.file_key).toMatch(
      new RegExp(`^attachments/${projectId}/${taskId}/[\\w-]+\\.txt$`),
    );

    const object = await env.BUCKET.get(row!.file_key);
    expect(await object?.text()).toBe("hello");
  });

  it("requires member+ role", async () => {
    const owner = await seedUser("a-owner4@example.com");
    const viewer = await seedUser("a-viewer4@example.com");
    const { projectId, taskId } = await seedProject(owner.id);
    await seedMember(projectId, viewer.id, "viewer");

    const res = await apiRequest(`/api/tasks/${taskId}/attachments`, {
      ...uploadBody("notes.txt", "text/plain", new TextEncoder().encode("hello")),
      headers: authHeader(viewer),
    });
    expect(res.status).toBe(403);
  });

  it("rejects a missing file field with 422", async () => {
    const owner = await seedUser("a-owner5@example.com");
    const { taskId } = await seedProject(owner.id);

    const form = new FormData();
    form.append("not-file", "oops");
    const res = await apiRequest(`/api/tasks/${taskId}/attachments`, {
      method: "POST",
      body: form,
      headers: authHeader(owner),
    });
    expect(res.status).toBe(422);
  });

  it("rejects an oversize file with 413", async () => {
    const owner = await seedUser("a-owner6@example.com");
    const { taskId } = await seedProject(owner.id);

    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    const res = await apiRequest(`/api/tasks/${taskId}/attachments`, {
      ...uploadBody("big.txt", "text/plain", oversized),
      headers: authHeader(owner),
    });
    expect(res.status).toBe(413);
  });

  it("accepts a CSV file", async () => {
    const owner = await seedUser("a-owner15@example.com");
    const { taskId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/tasks/${taskId}/attachments`, {
      ...uploadBody("data.csv", "text/csv", new TextEncoder().encode("a,b\n1,2")),
      headers: authHeader(owner),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.attachment.mimeType).toBe("text/csv");
  });

  it("accepts an XLSX file", async () => {
    const owner = await seedUser("a-owner16@example.com");
    const { projectId, taskId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/tasks/${taskId}/attachments`, {
      ...uploadBody(
        "sheet.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        new TextEncoder().encode("pk-zip-bytes"),
      ),
      headers: authHeader(owner),
    });
    expect(res.status).toBe(201);
    const body = await res.json();

    const row = await env.DB.prepare("SELECT file_key FROM attachments WHERE id = ?")
      .bind(body.attachment.id)
      .first<{ file_key: string }>();
    expect(row?.file_key).toMatch(new RegExp(`^attachments/${projectId}/${taskId}/[\\w-]+\\.xlsx$`));
  });

  it("rejects an SVG with 415", async () => {
    const owner = await seedUser("a-owner7@example.com");
    const { taskId } = await seedProject(owner.id);

    const res = await apiRequest(`/api/tasks/${taskId}/attachments`, {
      ...uploadBody("logo.svg", "image/svg+xml", new TextEncoder().encode("<svg></svg>")),
      headers: authHeader(owner),
    });
    expect(res.status).toBe(415);
  });
});

describe("GET /api/attachments/:id/download", () => {
  it("streams the file with Content-Disposition: attachment", async () => {
    const owner = await seedUser("a-owner8@example.com");
    const { taskId } = await seedProject(owner.id);

    const createRes = await apiRequest(`/api/tasks/${taskId}/attachments`, {
      ...uploadBody("report.pdf", "application/pdf", new TextEncoder().encode("pdf-bytes")),
      headers: authHeader(owner),
    });
    const { attachment } = await createRes.json();

    const res = await apiRequest(`/api/attachments/${attachment.id}/download`, {
      headers: authHeader(owner),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="report.pdf"');
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await res.text()).toBe("pdf-bytes");
  });

  it("returns 404 to a non-member", async () => {
    const owner = await seedUser("a-owner9@example.com");
    const outsider = await seedUser("a-outsider9@example.com");
    const { taskId } = await seedProject(owner.id);

    const createRes = await apiRequest(`/api/tasks/${taskId}/attachments`, {
      ...uploadBody("notes.txt", "text/plain", new TextEncoder().encode("hello")),
      headers: authHeader(owner),
    });
    const { attachment } = await createRes.json();

    const res = await apiRequest(`/api/attachments/${attachment.id}/download`, {
      headers: authHeader(outsider),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for a nonexistent attachment", async () => {
    const owner = await seedUser("a-owner10@example.com");
    const res = await apiRequest("/api/attachments/00000000-0000-4000-8000-000000000000/download", {
      headers: authHeader(owner),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/attachments/:id", () => {
  it("lets the uploader delete their own attachment, from both R2 and D1", async () => {
    const owner = await seedUser("a-owner11@example.com");
    const { taskId } = await seedProject(owner.id);

    const createRes = await apiRequest(`/api/tasks/${taskId}/attachments`, {
      ...uploadBody("notes.txt", "text/plain", new TextEncoder().encode("hello")),
      headers: authHeader(owner),
    });
    const { attachment } = await createRes.json();
    const row = await env.DB.prepare("SELECT file_key FROM attachments WHERE id = ?")
      .bind(attachment.id)
      .first<{ file_key: string }>();

    const res = await apiRequest(`/api/attachments/${attachment.id}`, {
      method: "DELETE",
      headers: authHeader(owner),
    });
    expect(res.status).toBe(204);

    const dbRow = await env.DB.prepare("SELECT 1 FROM attachments WHERE id = ?").bind(attachment.id).first();
    expect(dbRow).toBeNull();
    expect(await env.BUCKET.get(row!.file_key)).toBeNull();
  });

  it("forbids a non-uploader member below admin from deleting", async () => {
    const owner = await seedUser("a-owner12@example.com");
    const member = await seedUser("a-member12@example.com");
    const { projectId, taskId } = await seedProject(owner.id);
    await seedMember(projectId, member.id, "member");

    const createRes = await apiRequest(`/api/tasks/${taskId}/attachments`, {
      ...uploadBody("notes.txt", "text/plain", new TextEncoder().encode("hello")),
      headers: authHeader(owner),
    });
    const { attachment } = await createRes.json();

    const res = await apiRequest(`/api/attachments/${attachment.id}`, {
      method: "DELETE",
      headers: authHeader(member),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 for a nonexistent attachment", async () => {
    const owner = await seedUser("a-owner13@example.com");
    const res = await apiRequest("/api/attachments/00000000-0000-4000-8000-000000000000", {
      method: "DELETE",
      headers: authHeader(owner),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/tasks/:id cascade", () => {
  it("removes R2 objects when the task is deleted", async () => {
    const owner = await seedUser("a-owner14@example.com");
    const { taskId } = await seedProject(owner.id);

    const createRes = await apiRequest(`/api/tasks/${taskId}/attachments`, {
      ...uploadBody("notes.txt", "text/plain", new TextEncoder().encode("hello")),
      headers: authHeader(owner),
    });
    const { attachment } = await createRes.json();
    const row = await env.DB.prepare("SELECT file_key FROM attachments WHERE id = ?")
      .bind(attachment.id)
      .first<{ file_key: string }>();

    const res = await apiRequest(`/api/tasks/${taskId}`, { method: "DELETE", headers: authHeader(owner) });
    expect(res.status).toBe(200);

    expect(await env.BUCKET.get(row!.file_key)).toBeNull();
    const attachmentRow = await env.DB.prepare("SELECT 1 FROM attachments WHERE id = ?")
      .bind(attachment.id)
      .first();
    expect(attachmentRow).toBeNull();
  });
});
