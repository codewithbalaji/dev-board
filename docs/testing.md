# Testing

> How DevBoard is verified: the automated gates that run today, the test stack for Worker code, per-layer strategy for each Cloudflare primitive, and the manual scripts that prove the things automation cannot.
>
> Start at [AGENT.md](../AGENT.md) · Related: [architecture.md](./architecture.md) · [database.md](./database.md) · [roadmap.md](./roadmap.md)

**Status:** The automated gates in §2 work today. The test framework in §3 is a **Phase 2** addition — no test dependencies are installed yet.

---

## 1. Strategy

A Workers project inverts the usual testing advice. In a Node app you mock the database because it is slow and stateful; here, Miniflare gives you a **real D1, real KV, real R2, real Durable Objects, and a real Queue** in-process, in milliseconds. Mocking them would be strictly worse — more code, less fidelity, and it would hide precisely the platform behaviours this project exists to learn.

So the pyramid is unusually integration-heavy on purpose:

```
        ╱  Manual  ╲          Realtime, cross-window, visual, a11y, edge behaviour
       ╱─────────────╲
      ╱  Integration  ╲       ~60% — routes against real local bindings
     ╱─────────────────╲
    ╱       Unit        ╲     ~30% — pure functions: crypto, JWT, cache keys, positions
   ╱─────────────────────╲
  ╱     Static gates      ╲   Always — tsc ×2, oxlint, wrangler types
 ╱─────────────────────────╲
```

Two principles govern what gets a test:

**Test the seam, not the library.** Do not test that `env.DB.prepare()` works. Test that *your* route returns 404 when a non-member asks for a project, that *your* cache is purged on mutation, that *your* consumer retries the whole batch.

**Every claim in these docs is a test or a script.** If [security.md](./security.md) says a non-member gets 404 rather than 403, there is a test asserting exactly that. Documentation nobody verifies rots into fiction.

---

## 2. Static gates — available now

These four commands are the floor. Run them before every commit; nothing merges that fails one.

```bash
npm run lint            # oxlint 1.79 — exists today
npm run build           # tsc -b && vite build — typechecks src/ and builds
npm run worker:check    # tsc -p tsconfig.worker.json --noEmit   (Phase 1)
npx wrangler types      # regenerates worker-configuration.d.ts   (Phase 1)
npm run db:migrate      # applies migrations to local D1 — proves the SQL parses (Phase 2)
```

**`npm run build` and `npm run worker:check` are both required and neither replaces the other.** They compile different code with different libs: `tsconfig.app.json` includes `lib: ["ES2023", "DOM"]` and only `src`, while `tsconfig.worker.json` deliberately excludes DOM types and only covers `worker`. A Worker file that references `document` typechecks under the first and fails under the second — which is the entire reason for two configs.

The frontend config already enables the strict flags that catch the most: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`. Match them in the Worker config.

`wrangler types` belongs in the gate list because a binding added to `wrangler.jsonc` without regenerating types produces code that compiles against a stale `Env` — a failure that surfaces at runtime in production rather than at build time.

---

## 3. The test stack — Phase 2

```bash
npm install -D vitest @cloudflare/vitest-pool-workers
```

**`@cloudflare/vitest-pool-workers` runs your tests inside workerd itself**, with the bindings from `wrangler.jsonc` available on an imported `env`. Not a simulation of the runtime — the runtime.

| | **vitest-pool-workers** | **vitest + hand-written mocks** |
| :--- | :--- | :--- |
| `env.DB` in a test | Real local D1 | A fake you maintain forever |
| Catches runtime-only bugs (no `Buffer`, no `fs`) | Yes | No — Node globals leak in |
| DO hibernation, WebSocket pairs | Testable | Not meaningfully |
| Queue batching and retries | Testable | Not meaningfully |
| Setup cost | One config file | Ongoing mock maintenance |
| Speed | Fast enough (ms per test) | Marginally faster |

The choice is not close. The one real cost is that you cannot use Node-only test utilities inside worker tests — which is the same constraint the production code lives under, so it is a feature.

```ts
// vitest.config.ts — Phase 2
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Each test file gets its own isolated storage.
          isolatedStorage: true,
          bindings: { JWT_SECRET: "test-secret-not-a-real-one" },
        },
      },
    },
  },
});
```

Scripts to add alongside it:

```jsonc
"test":          "vitest run",
"test:watch":    "vitest",
"test:coverage": "vitest run --coverage"
```

### Migrations in tests

Every test run needs a schema. Apply migrations once in a setup file:

```ts
// test/setup.ts
import { env, applyD1Migrations } from "cloudflare:test";
import migrations from "../worker/db/migrations";   // provided by the pool's migration loader

await applyD1Migrations(env.DB, migrations);
```

With `isolatedStorage: true`, each test file starts from a clean slate and cannot be polluted by another file's rows. This is worth the small startup cost — cross-test data leakage produces the worst class of flaky test.

---

## 4. Unit tests

Pure functions with real logic and no I/O. Fast, exhaustive, cheap.

| Module | What to assert |
| :--- | :--- |
| `lib/password.ts` | Same password + same salt → same hash; different salts → different hashes; `verifyPassword` true for correct, false for wrong; a wrong password of the *same length* still returns false (guards the constant-time comparison) |
| `lib/jwt.ts` | Round-trip sign→verify; tampered payload rejected; tampered signature rejected; expired token rejected; **`alg: "none"` rejected**; `alg: "RS256"` rejected; malformed (2-part, 4-part) rejected |
| `lib/cache-keys.ts` | Exact key strings — these are a contract with [database.md §9](./database.md#9-kv-key-namespaces), and a typo means a cache that never purges |
| `lib/position.ts` | Midpoint between neighbours; insert at head; insert at tail into an empty column; precision does not collapse over 50 successive bisections |
| Validation helpers | Boundary lengths (0, 1, max, max+1); email normalisation lowercases and trims; enum values match the D1 `CHECK` lists exactly |

```ts
// test/unit/jwt.test.ts
import { describe, it, expect } from "vitest";
import { signJWT, verifyJWT } from "../../worker/lib/jwt";

const SECRET = "test-secret";

describe("verifyJWT", () => {
  it("rejects the alg:none confusion attack", async () => {
    const header  = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
    const payload = btoa(JSON.stringify({ sub: "attacker", exp: 9e9 }));
    await expect(verifyJWT(`${header}.${payload}.`, SECRET)).rejects.toThrow(/algorithm/i);
  });

  it("rejects an expired token", async () => {
    const token = await signJWT({ sub: "u1", exp: Math.floor(Date.now() / 1000) - 1 }, SECRET);
    await expect(verifyJWT(token, SECRET)).rejects.toThrow(/expired/i);
  });
});
```

The `alg: "none"` test is not theoretical trivia. It is the single most common JWT implementation flaw, and this project hand-rolls its JWT layer.

---

## 5. Integration tests — routes against real bindings

The bulk of the suite. Drive the Hono app through `SELF.fetch()` or by importing the app directly, with real local D1/KV/R2 behind it.

```ts
// test/integration/tasks.test.ts
import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { seedUser, seedProject, authHeader } from "../helpers";

describe("PATCH /api/tasks/:id/status", () => {
  let owner: TestUser, outsider: TestUser, projectId: string, taskId: string;

  beforeEach(async () => {
    owner    = await seedUser(env, "owner@test.dev");
    outsider = await seedUser(env, "outsider@test.dev");
    ({ projectId, taskId } = await seedProject(env, owner.id));
  });

  it("moves the task and reports one changed row", async () => {
    const res = await SELF.fetch(`https://x/api/tasks/${taskId}/status`, {
      method: "PATCH",
      headers: { ...authHeader(owner), "content-type": "application/json" },
      body: JSON.stringify({ status: "done", position: 1500 }),
    });

    expect(res.status).toBe(200);

    const row = await env.DB
      .prepare("SELECT status, position FROM tasks WHERE id = ?")
      .bind(taskId).first();
    expect(row).toMatchObject({ status: "done", position: 1500 });
  });

  it("purges the project stats cache", async () => {
    const key = `cache:project:stats:${projectId}`;
    await env.KV.put(key, JSON.stringify({ stale: true }));

    await SELF.fetch(`https://x/api/tasks/${taskId}/status`, {
      method: "PATCH",
      headers: { ...authHeader(owner), "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });

    expect(await env.KV.get(key)).toBeNull();
  });

  it("returns 404 — not 403 — to a non-member", async () => {
    const res = await SELF.fetch(`https://x/api/tasks/${taskId}/status`, {
      method: "PATCH",
      headers: { ...authHeader(outsider), "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    expect(res.status).toBe(404);          // an existence oracle would be a leak
  });
});
```

### Coverage expectations per route

Every mutating route gets, at minimum:

- happy path — correct status, correct response body, correct row in D1
- unauthenticated → 401
- authenticated non-member → **404**
- insufficient role (e.g. `viewer` writing) → 403
- validation failure → 422 with `details.field`
- nonexistent id → 404
- **cache invalidation asserted**, where the route touches cached data

That third and seventh bullet are the ones that get skipped and the ones that matter most. Authorization and invalidation are exactly the logic that silently rots.

### KV cache behaviour

```ts
it("MISSes then HITs", async () => {
  const h = authHeader(owner);
  const first  = await SELF.fetch(`https://x/api/projects/${projectId}/stats`, { headers: h });
  expect(first.headers.get("X-DevBoard-Cache")).toBe("MISS");

  const second = await SELF.fetch(`https://x/api/projects/${projectId}/stats`, { headers: h });
  expect(second.headers.get("X-DevBoard-Cache")).toBe("HIT");
  expect(await second.json()).toEqual(await first.clone().json());
});

it("survives KV being unavailable", async () => {
  // A cache outage must degrade, never 500. See architecture.md §10.
  vi.spyOn(env.KV, "get").mockRejectedValue(new Error("KV down"));
  const res = await SELF.fetch(`https://x/api/projects/${projectId}/stats`, { headers: authHeader(owner) });
  expect(res.status).toBe(200);
  expect(res.headers.get("X-DevBoard-Cache")).toBe("BYPASS");
});
```

**Local KV is immediately consistent; production KV is not.** No local test can prove your invalidation is correct under real propagation delay. Compensate by asserting the *delete call happened*, and by re-running the cache scenarios against `wrangler dev --remote` before shipping Phase 4.

### R2

```ts
it("stores bytes in R2 and metadata in D1", async () => {
  const file = new File(["hello"], "note.txt", { type: "text/plain" });
  const form = new FormData();
  form.append("file", file);

  const res = await SELF.fetch(`https://x/api/tasks/${taskId}/attachments`, {
    method: "POST", headers: authHeader(owner), body: form,
  });
  expect(res.status).toBe(201);

  const { id, fileKey } = await res.json();
  expect(await env.BUCKET.head(fileKey)).not.toBeNull();

  const row = await env.DB.prepare("SELECT * FROM attachments WHERE id = ?").bind(id).first();
  expect(row.file_key).toBe(fileKey);
  expect(fileKey).toMatch(/^attachments\/[\w-]+\/[\w-]+\/[\w-]+\.txt$/);
});

it("rejects an SVG upload", async () => { /* → 415 */ });
it("rejects a file over the size limit", async () => { /* → 413 */ });
it("sends Content-Disposition: attachment on download", async () => { /* XSS guard */ });
it("deletes from R2 and D1 together", async () => { /* head() → null, row gone */ });
```

---

## 6. Durable Object tests

`runInDurableObject` reaches inside an instance to assert its state directly.

```ts
import { env, runInDurableObject } from "cloudflare:test";

it("broadcasts to every connected socket except the sender", async () => {
  const id   = env.REALTIME_BOARD.idFromName("project-1");
  const stub = env.REALTIME_BOARD.get(id);

  const a = await connect(stub, { userId: "u1" });
  const b = await connect(stub, { userId: "u2" });

  const received: string[] = [];
  b.addEventListener("message", (e) => received.push(e.data as string));

  a.send(JSON.stringify({ type: "task.moved", taskId: "t1" }));
  await vi.waitFor(() => expect(received).toHaveLength(1));

  expect(JSON.parse(received[0])).toMatchObject({ type: "task.moved", taskId: "t1" });
});

it("rebuilds its roster from socket attachments after hibernation", async () => {
  const stub = env.REALTIME_BOARD.get(env.REALTIME_BOARD.idFromName("project-1"));
  await connect(stub, { userId: "u1", displayName: "Alice" });

  await runInDurableObject(stub, async (instance, state) => {
    // Simulate a wake: instance fields are gone, sockets are not.
    const sockets = state.getWebSockets();
    expect(sockets).toHaveLength(1);
    expect(sockets[0].deserializeAttachment()).toMatchObject({ displayName: "Alice" });
  });
});
```

The hibernation test earns its place: the *only* bug class hibernation introduces is code that assumed an in-memory field survived. A test that asserts state is reconstructed from `getWebSockets()` catches it before production does.

Also cover: presence broadcast on connect and on close; `idFromName` giving the same instance for the same project and a different one for a different project; a `/broadcast` POST from the Worker reaching all sockets.

---

## 7. Queue tests

Two halves, tested separately.

**Producer** — assert the route sends the right message and does not wait for processing:

```ts
it("enqueues an activity message on status change", async () => {
  const sent: ActivityMessage[] = [];
  vi.spyOn(env.ACTIVITY_QUEUE, "send").mockImplementation(async (m) => { sent.push(m); });

  await SELF.fetch(`https://x/api/tasks/${taskId}/status`, {
    method: "PATCH", headers: { ...authHeader(owner), "content-type": "application/json" },
    body: JSON.stringify({ status: "done" }),
  });

  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    type: "task.status_changed",
    projectId,
    payload: { from: "todo", to: "done" },
  });
  expect(sent[0].occurredAt).toBeTypeOf("number");
});
```

**Consumer** — invoke the handler directly with a synthetic batch:

```ts
it("batch-inserts every message and acks once", async () => {
  const batch = makeBatch([
    { type: "task.created", projectId, actorId: owner.id, entityType: "task", entityId: "t1", occurredAt: 1000 },
    { type: "comment.created", projectId, actorId: owner.id, entityType: "comment", entityId: "c1", occurredAt: 1001 },
  ]);

  await handleActivityBatch(batch, env);

  const { results } = await env.DB
    .prepare("SELECT * FROM activities WHERE project_id = ? ORDER BY occurred_at").bind(projectId).all();
  expect(results).toHaveLength(2);
  expect(results[0].processed_at).toBeGreaterThanOrEqual(results[0].occurred_at);
  expect(batch.ackAll).toHaveBeenCalledOnce();
  expect(batch.retryAll).not.toHaveBeenCalled();
});

it("retries the whole batch when the D1 write fails", async () => {
  vi.spyOn(env.DB, "batch").mockRejectedValue(new Error("D1 down"));
  const batch = makeBatch([{ type: "task.created", projectId, occurredAt: 1000 }]);

  await expect(handleActivityBatch(batch, env)).rejects.toThrow();
  expect(batch.retryAll).toHaveBeenCalled();
  expect(batch.ackAll).not.toHaveBeenCalled();     // partial acks would be a lie
});
```

That last assertion encodes a real design constraint: because `env.DB.batch()` is atomic, ack granularity must match transaction granularity. A test is the right place to freeze that decision.

Also worth covering: `occurred_at` is preserved from the producer while `processed_at` is stamped by the consumer (this pair is what the UI's latency chip renders), and duplicate delivery of the same message produces a duplicate row — asserting the *known* at-least-once behaviour so that when deduplication is added, the change is visible.

---

## 8. Rate limiting and Turnstile tests

```ts
it("429s the sixth login attempt within the window", async () => {
  for (let i = 0; i < 5; i++) {
    const r = await login("victim@test.dev", "wrong-password");
    expect(r.status).toBe(401);
  }
  const sixth = await login("victim@test.dev", "wrong-password");
  expect(sixth.status).toBe(429);
  expect(Number(sixth.headers.get("Retry-After"))).toBeGreaterThan(0);
});

it("rejects a request with no Turnstile token", async () => { /* → 400 TURNSTILE_MISSING */ });

it("rejects when siteverify says success:false", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ success: false, "error-codes": ["invalid-input-response"] }),
  );
  const res = await register({ email: "bot@test.dev", turnstileToken: "forged" });
  expect(res.status).toBe(403);
});

it("does not reveal whether an email exists", async () => {
  const missing = await login("nobody@test.dev", "x");
  const wrong   = await login("owner@test.dev", "x");
  expect(missing.status).toBe(wrong.status);
  expect(await missing.json()).toEqual(await wrong.json());   // identical copy
});
```

The last test guards a property that is trivially broken by a well-meaning "user not found" message.

---

## 9. Frontend tests

Lighter than the Worker suite — the interesting logic lives at the edge, and browser-level behaviour is better covered by the manual scripts.

Worth testing: the `api/client.ts` wrapper (attaches the bearer token, parses the error envelope into an `ApiError`, extracts `X-DevBoard-*` headers), the `useRealtime` reducer mapping WS events to state changes, optimistic update + rollback on failure, and the fractional-position computation for a drag.

Not worth testing: that shadcn's `Button` renders. Component snapshot tests on a design system you did not write are maintenance cost with no defect-catching power.

---

## 10. Manual test scripts

Run before declaring a phase complete. These cover what automation cannot: real edge behaviour, cross-window realtime, and visual correctness.

### M1 — Edge identity (Phase 1)
1. `npm run worker:dev` and `npm run dev`; open `localhost:5173`.
2. Inspector bar shows `LOCAL` and a duration in ms.
3. `curl -s localhost:8787/api/health` → `{"status":"ok"}`.
4. After deploying: the bar shows a real colo (`BOM`, `SIN`, `DFW`…).
5. Resize 375 px → 2560 px. No horizontal scroll at any width.

### M2 — Auth and data (Phase 2)
1. Register. Confirm a JWT is stored and survives a reload.
2. `wrangler d1 execute devboard-db --local --command "SELECT email, password_hash FROM users"` — the password is nowhere in plaintext.
3. Register the same email again → 409.
4. Create a project. Verify **both** rows exist:
   `SELECT * FROM projects; SELECT * FROM project_members;`
5. Create three tasks; drag one to In Progress; reload — order and status persist.
6. Reorder within a column, then check `meta.changes`-equivalent: only one row's `position` changed.
7. Register a second user; from that account request the first user's project id → **404**.

### M3 — Attachments (Phase 3)
1. Upload a PNG; progress indicator appears; badge count increments.
2. `wrangler r2 object get devboard-attachments <key> --local` retrieves it.
3. Download from the UI — correct filename, and it downloads rather than rendering.
4. Upload an 11 MB file → 413. Upload an `.svg` → 415.
5. Delete the attachment; confirm gone from both R2 and D1; the download URL now 404s.

### M4 — Cache, visibly (Phase 4)
1. Open a project. DevTools → Network → the stats request → `X-DevBoard-Cache: MISS`. Note the duration.
2. Reload within 60 s → `HIT`, materially faster. The Inspector bar's cache pill changes.
3. Edit a task, reload stats → `MISS` again (invalidation fired).
4. Click **Purge cache** → next load is `MISS`.
5. Wait 60 s without touching anything → `MISS` (TTL expiry).
6. `wrangler kv key list --binding KV --local` — only documented prefixes appear.

### M5 — Realtime, two windows (Phase 5)
The one that cannot be automated meaningfully.
1. Two browser windows side by side, both on the same project, logged in as different users.
2. Move a card in A → B updates in under a second, with no refresh.
3. Presence avatars in both show two people.
4. Add a comment in A with B's task modal open → it appears in B.
5. Close A → B's presence updates within a few seconds.
6. Kill the Worker (`Ctrl-C`) → B shows a reconnecting state, not a crash.
7. Restart it → B reconnects and re-syncs board state.
8. In A, move a card and watch A itself: **no flicker or double-apply** from its own broadcast echo.

### M6 — Queue latency, visibly (Phase 6)
1. Create a task and immediately watch the Activity Feed. The API response returns *before* the entry appears — that gap is the lesson.
2. The entry carries the *Processed via Cloudflare Queue* badge and a latency chip.
3. `SELECT occurred_at, processed_at, processed_at - occurred_at AS lag FROM activities ORDER BY occurred_at DESC LIMIT 5;`
4. Fire ten actions quickly → they arrive batched, not one at a time.
5. Force the consumer to throw → observe retries in `wrangler tail`, then a message in `devboard-activity-dlq`. **The user's original write is untouched.**

### M7 — Abuse protection (Phase 7)
1. Submit registration with the widget bypassed (strip the token in DevTools) → 403.
2. Replay a used Turnstile token → 403.
3. Six failed logins in a minute → 429 with `Retry-After`; the UI shows a countdown, not a raw error.
4. Wait out the window → login works again.
5. `curl -sI` a real response: HSTS, CSP, `nosniff`, `Referrer-Policy` all present.
6. Load the page with the console open: no CSP violations; the Turnstile widget renders; the WebSocket connects.

### M8 — Production (Phase 8)
1. `npm run deploy`; `/api/health` on the real domain returns 200.
2. Certificate valid; HTTP/3 negotiated (DevTools → Protocol column shows `h3`).
3. `curl -sI https://<domain>/assets/index-*.js` → long-lived cache header.
4. `curl -sI https://<domain>/api/health` → not cached.
5. Run M2 through M7 against production.
6. `wrangler tail` during a request: structured logs, no secrets.
7. `wrangler rollback` then re-deploy — confirm both work before you need them.

### M9 — Accessibility (any phase touching UI)
1. Tab through every screen: focus visible at all times, order matches reading order, no traps.
2. Move a task between columns using only the keyboard.
3. Open and close the task modal by keyboard; focus returns to the trigger.
4. Screen reader: realtime updates are announced via a live region; Inspector bar status changes are not spammed.
5. Toggle dark mode — contrast holds in both themes.

---

## 11. Definition of done, per phase

A phase is complete only when **all** of these hold:

- [ ] All four static gates pass
- [ ] New routes have the seven-case coverage from §5
- [ ] New pure functions have unit tests
- [ ] The phase's manual script (M1–M9) passes end to end
- [ ] Cache invalidation is asserted for any route touching cached data
- [ ] Failure modes degrade as [architecture.md §10](./architecture.md#10-failure-modes-and-what-happens) specifies — verified by actually breaking the dependency
- [ ] Any doc whose claims changed is updated **in the same commit**
- [ ] `roadmap.md`'s status table reflects reality

---

## 12. Test data helpers

`test/helpers.ts` keeps setup out of the tests themselves:

```ts
export async function seedUser(env: Env, email: string): Promise<TestUser>;
export async function seedProject(env: Env, ownerId: string): Promise<{ projectId: string; taskId: string }>;
export async function seedMember(env: Env, projectId: string, userId: string, role: Role): Promise<void>;
export function authHeader(user: TestUser): Record<string, string>;
export function makeBatch(bodies: Partial<ActivityMessage>[]): MessageBatch<ActivityMessage>;
export async function connect(stub: DurableObjectStub, attach: object): Promise<WebSocket>;
```

Rules: helpers insert through **D1 directly**, not through the API, so a broken registration route does not cascade into every unrelated test failure. `seedUser` uses a low PBKDF2 iteration count via an injected constant — 100,000 iterations × dozens of tests is slow enough to change your behaviour about writing them.
