import { describe, expect, it } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { connect } from "../helpers";

function nextMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    ws.addEventListener("message", (event) => resolve(JSON.parse(event.data as string)), { once: true });
  });
}

describe("RealtimeBoard", () => {
  it("idFromName resolves to the same instance for the same project, a different one for another", async () => {
    const stubA1 = env.REALTIME_BOARD.get(env.REALTIME_BOARD.idFromName("project-iso"));
    const a = await connect(stubA1, { userId: "u1" });
    await nextMessage(a); // presence from a's own connect

    // A second lookup by the same name must reach a's existing socket.
    const stubA2 = env.REALTIME_BOARD.get(env.REALTIME_BOARD.idFromName("project-iso"));
    const aMessage = nextMessage(a);
    await stubA2.fetch("https://do/broadcast", {
      method: "POST",
      body: JSON.stringify({ type: "task.deleted", taskId: "t9", projectId: "project-iso" }),
    });
    await expect(aMessage).resolves.toMatchObject({ type: "task.deleted", taskId: "t9" });

    // A different project name must be a different instance with no socket, so
    // this must simply not deliver anything to a.
    const stubB = env.REALTIME_BOARD.get(env.REALTIME_BOARD.idFromName("project-other"));
    let aGotUnrelatedBroadcast = false;
    a.addEventListener("message", () => {
      aGotUnrelatedBroadcast = true;
    });
    await stubB.fetch("https://do/broadcast", {
      method: "POST",
      body: JSON.stringify({ type: "task.deleted", taskId: "unrelated", projectId: "project-other" }),
    });
    expect(aGotUnrelatedBroadcast).toBe(false);
    a.close();
  });

  it("broadcasts presence on connect and on close", async () => {
    const stub = env.REALTIME_BOARD.get(env.REALTIME_BOARD.idFromName("project-presence"));

    const a = await connect(stub, { userId: "u1", displayName: "Alice" });
    await expect(nextMessage(a)).resolves.toMatchObject({
      type: "presence",
      members: [{ userId: "u1", displayName: "Alice" }],
    });

    const aOnBConnect = nextMessage(a);
    const b = await connect(stub, { userId: "u2", displayName: "Bob" });
    const expectedRoster = expect.arrayContaining([
      { userId: "u1", displayName: "Alice" },
      { userId: "u2", displayName: "Bob" },
    ]);
    await expect(nextMessage(b)).resolves.toMatchObject({ type: "presence", members: expectedRoster });
    await expect(aOnBConnect).resolves.toMatchObject({ type: "presence", members: expectedRoster });

    const aOnBClose = nextMessage(a);
    b.close();
    await expect(aOnBClose).resolves.toMatchObject({
      type: "presence",
      members: [{ userId: "u1", displayName: "Alice" }],
    });
    a.close();
  });

  it("reaches all connected sockets via a /broadcast POST", async () => {
    const stub = env.REALTIME_BOARD.get(env.REALTIME_BOARD.idFromName("project-broadcast"));
    const a = await connect(stub, { userId: "u1" });
    await nextMessage(a); // presence: [u1]

    // Register listeners before triggering the event that produces the
    // message — WebSocket "message" events are not buffered for a listener
    // attached after the fact.
    const aOnBConnect = nextMessage(a); // presence: [u1, u2]
    const b = await connect(stub, { userId: "u2" });
    await nextMessage(b); // presence: [u1, u2], its own connect
    await aOnBConnect;

    const aMessage = nextMessage(a);
    const bMessage = nextMessage(b);
    await stub.fetch("https://do/broadcast", {
      method: "POST",
      body: JSON.stringify({ type: "task.deleted", taskId: "t1", projectId: "project-broadcast" }),
    });
    await expect(aMessage).resolves.toMatchObject({ type: "task.deleted", taskId: "t1" });
    await expect(bMessage).resolves.toMatchObject({ type: "task.deleted", taskId: "t1" });
    a.close();
    b.close();
  });

  it("relays a socket message to every other socket, never back to the sender", async () => {
    const stub = env.REALTIME_BOARD.get(env.REALTIME_BOARD.idFromName("project-relay"));
    const a = await connect(stub, { userId: "u1" });
    await nextMessage(a); // presence: [u1]
    const aOnBConnect = nextMessage(a); // presence: [u1, u2]
    const b = await connect(stub, { userId: "u2" });
    await nextMessage(b); // presence: [u1, u2]
    await aOnBConnect;

    let aGotEcho = false;
    a.addEventListener("message", () => {
      aGotEcho = true;
    });
    const bMessage = nextMessage(b);
    a.send(JSON.stringify({ type: "cursor", x: 1, y: 2 }));
    await expect(bMessage).resolves.toMatchObject({ type: "cursor", x: 1, y: 2 });
    expect(aGotEcho).toBe(false);
    a.close();
    b.close();
  });

  it("rebuilds its roster from socket attachments after hibernation", async () => {
    const stub = env.REALTIME_BOARD.get(env.REALTIME_BOARD.idFromName("project-hibernate"));
    await connect(stub, { userId: "u1", displayName: "Alice" });

    await runInDurableObject(stub, async (_instance, state) => {
      const sockets = state.getWebSockets();
      expect(sockets).toHaveLength(1);
      expect(sockets[0].deserializeAttachment()).toMatchObject({ userId: "u1", displayName: "Alice" });
    });
  });
});
