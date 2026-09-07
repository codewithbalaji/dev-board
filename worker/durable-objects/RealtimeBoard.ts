import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";

interface SocketAttachment {
  userId: string | null;
  displayName: string | null;
  joinedAt: number;
}

// One instance per project, addressed by idFromName(projectId). Instance
// fields do not survive hibernation — the roster is always rebuilt from
// ctx.getWebSockets() and each socket's deserializeAttachment(), never
// cached on the heap.
export class RealtimeBoard extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/broadcast") {
      const payload = await request.json();
      this.broadcast(payload);
      return new Response(null, { status: 204 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      userId: url.searchParams.get("userId"),
      displayName: url.searchParams.get("displayName"),
      joinedAt: Date.now(),
    } satisfies SocketAttachment);

    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    if (typeof message !== "string") return;
    let payload: unknown;
    try {
      payload = JSON.parse(message);
    } catch {
      return;
    }
    this.broadcast(payload, ws);
  }

  async webSocketClose(_ws: WebSocket) {
    this.broadcastPresence();
  }

  private broadcastPresence() {
    const members = this.ctx.getWebSockets().map((ws) => {
      const attachment = ws.deserializeAttachment() as SocketAttachment;
      return { userId: attachment.userId ?? "", displayName: attachment.displayName ?? "" };
    });
    this.broadcast({ type: "presence", members });
  }

  private broadcast(payload: unknown, except?: WebSocket) {
    const data = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== except) ws.send(data);
    }
  }
}
