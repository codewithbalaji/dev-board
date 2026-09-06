# Product

> What DevBoard is, who it is for, what it does, and how we know a phase is finished.
>
> Start at [AGENT.md](../AGENT.md) · Related: [roadmap.md](./roadmap.md) · [DESIGN.md](../DESIGN.md)

**Status:** Specification. The repo currently contains the frontend scaffold only. Every feature below is unbuilt.

---

## 1. What DevBoard is

DevBoard is a Kanban task manager for small development teams: projects, tasks in three columns, comments, file attachments, and a live activity feed — with every collaborator seeing changes the instant they happen.

It is also, unapologetically, a machine for learning Cloudflare's serverless platform end to end. Those two goals are not in tension here; they are the same goal, because the app was chosen for the shape of its requirements:

| A Kanban board needs… | …which forces you to learn |
| :--- | :--- |
| Users, projects, tasks, relations | **D1** — relational SQL with foreign keys and migrations |
| File attachments on tasks | **R2** — blob storage, and why it stays out of the database |
| A dashboard that everyone loads constantly | **KV** — cache-aside, TTLs, and invalidation you have to get right |
| Two people watching the same board | **Durable Objects** — the only way stateless Workers can coordinate a WebSocket |
| An activity feed that must not slow down the UI | **Queues** — producer/consumer, batching, retries, dead letters |
| Public signup and login forms | **Turnstile** + **rate limiting** — abuse protection before business logic |
| To exist on the internet | **Workers**, **DNS/CDN/SSL**, and a real deploy |

Nothing is included to pad the feature list, and nothing is abstracted away to make the code look tidier. If a Cloudflare API is being called, you can see it being called.

---

## 2. The problem statement

Small dev teams coordinating work have two bad options. Heavyweight trackers (Jira, Linear at scale) impose ceremony that a four-person team does not need. Lightweight ones (a shared doc, a whiteboard) lose history and have no notion of who is doing what right now.

DevBoard targets the narrow middle: **fast enough to feel like a whiteboard, structured enough to keep a record.** Concretely, it optimises for three moments —

1. **Glance.** Open the board, understand project state in under two seconds.
2. **Move.** Drag a card, and have it saved and visible to everyone before you have let go of the mouse in your head.
3. **Recall.** Ask "what happened to this yesterday" and get an answer from the activity log.

Everything else is secondary.

---

## 3. Non-goals

Being explicit about these prevents scope creep and prevents the docs from over-promising.

| Not doing | Why |
| :--- | :--- |
| Sprints, story points, velocity charts | Agile ceremony is the thing the target user is escaping |
| Sub-tasks, dependencies, Gantt charts | Structural complexity that adds no Cloudflare learning |
| Custom workflows / configurable columns | Three fixed columns keep the realtime and cache logic legible |
| Email notifications | Would need Email Workers — noted as post-v1 in [roadmap.md](./roadmap.md) |
| Mobile apps | Responsive web only |
| Real-time collaborative *text* editing | CRDTs are a whole other project |
| Multi-tenancy / orgs / billing | One flat user space |
| Password reset, email verification, MFA | Deliberate gaps, catalogued in [security.md](./security.md) so they are known rather than forgotten |
| i18n / RTL | `components.json` has `"rtl": false`; not revisiting |

---

## 4. Who it is for

**Priya — solo developer, side projects.** Runs three projects at once, uses DevBoard as a structured to-do list. Cares about: instant load, keyboard speed, no setup. Never uses realtime features, never uploads a file. She is the reason the app must be useful with one user and zero collaborators.

**A four-person product team.** One shared project, tasks assigned across members, screenshots dropped onto bug cards, someone always has the board open on a second monitor. Cares about: seeing changes without refreshing, knowing who is looking at what, an activity trail. They are the reason Durable Objects and Queues exist in this design.

**You, reading the code.** The third persona, and a real one. Every architectural decision has to be *legible*. A clever abstraction that saves 30 lines but hides `env.DB` fails this user.

---

## 5. Domain model

```
User
 └── owns / is a member of ──► Project
                                 ├── Task
                                 │    ├── Comment
                                 │    └── Attachment  (metadata in D1, bytes in R2)
                                 └── Activity  (append-only, written by the Queue consumer)
```

| Object | Definition | Notes |
| :--- | :--- | :--- |
| **User** | An account: email, display name, password hash | No profile beyond a display name and an avatar colour |
| **Project** | A board. Owned by one user, visible to its members | Archivable, not deletable-by-accident |
| **Membership** | A `(project, user, role)` triple | Roles: `owner`, `admin`, `member`, `viewer`. All authorization reads this |
| **Task** | A card. Title, description, status, priority, assignee, due date, position | Status ∈ `todo` / `in_progress` / `done`. `position` is a fractional index for ordering |
| **Comment** | Plain-text note on a task, authored by a user | No threading, no editing history |
| **Attachment** | A file on a task | Row in D1, bytes in R2. See [database.md](./database.md#8-r2-object-layout) |
| **Activity** | An immutable record that something happened | Written *only* by the Queue consumer, never by a request handler |

Exact schema: [database.md](./database.md).

---

## 6. Feature set by phase

Each phase ships a working app. Nothing is a stub waiting on a later phase.

| Phase | User-visible outcome | Primitive |
| :---: | :--- | :--- |
| 1 | The app loads, shows an empty shell, and the Inspector bar reports which Cloudflare edge location served you | Workers |
| 2 | Register, log in, create projects, create and move tasks, comment | D1 |
| 3 | Drop a screenshot onto a task; download it later | R2 |
| 4 | Project stats load instantly; a badge shows whether they came from cache or the database | KV |
| 5 | Two people on the same board see each other's cursors move cards, live | Durable Objects |
| 6 | An activity feed fills in a moment after each action, showing its own processing latency | Queues |
| 7 | Signup and login are bot-protected and rate-limited | Turnstile + WAF |
| 8 | It is on the internet, on a real domain, over HTTPS | DNS/CDN/SSL |

Sequencing detail, dependencies, and exit criteria: [roadmap.md](./roadmap.md).

---

## 7. The Cloudflare Inspector bar is a feature

A persistent bar in the app chrome showing, live:

- the **edge colo** that served the current request (`BOM`, `SIN`, `DFW`… or `LOCAL` in dev)
- **round-trip duration** for the last API call, and D1 time within it
- a **cache pill**: `HIT` / `MISS` / `BYPASS`, with a **Purge cache** action next to it
- **service pills** lighting up for the primitives the last request touched: D1, KV, R2, DO, Queue
- **WebSocket state**: connected / reconnecting / offline, and the number of people present
- **queue lag**: the gap between an action and its activity row appearing

This is not debug chrome to be stripped before release. It is the product's distinguishing feature and its pedagogical core: the platform's behaviour is normally invisible, and DevBoard's answer is to render it. A user who drags a card and watches the D1 pill flash, the KV pill go dark on invalidation, and the Queue pill light up two seconds later has *learned the architecture by using the app*.

It is fed by the `X-DevBoard-*` response headers documented in [architecture.md](./architecture.md#response-headers). Visual specification in [DESIGN.md](../DESIGN.md).

---

## 8. User stories and acceptance criteria

Written so each is directly testable. The manual test scripts in [testing.md](./testing.md) follow these.

### Phase 1 — shell

- **As a visitor, I can load DevBoard and see it is alive.**
  - `GET /api/health` returns `200 {"status":"ok"}`.
  - `GET /api/info` returns colo, region, and worker execution time.
  - The Inspector bar renders a colo code (or `LOCAL`) and a duration in ms.
  - The shell is responsive from 375 px to 2560 px with no horizontal scroll.

### Phase 2 — accounts, projects, tasks

- **As a new user, I can register and land on my empty board.**
  - Email uniqueness enforced; a duplicate returns 409 with a readable message.
  - Password is never stored or logged in plaintext.
  - A JWT is returned, persisted, and survives a page reload.
- **As a user, I can create a project.**
  - Creating a project also creates my `owner` membership row, in the same D1 `batch()`.
  - The project appears in the sidebar without a manual refresh.
- **As a user, I can create a task and move it between columns.**
  - A new task lands at the bottom of `todo`.
  - Moving a card persists status *and* position; a reload shows the same order.
  - Reordering writes one row, not the whole column.
- **As a user, I can comment on a task.**
  - Comments show author and relative time, oldest first.
- **As a non-member, I cannot see someone else's project.**
  - Returns **404**, not 403 — an existence oracle is an information leak.

### Phase 3 — attachments

- **As a user, I can attach a file to a task.**
  - Progress indicator during upload; the badge count increments on success.
  - Files over the size limit are rejected client-side *and* server-side (413).
  - Disallowed MIME types are rejected with 415.
- **As a user, I can download an attachment.**
  - Correct filename and content type; downloads rather than rendering inline.
- **As a user, deleting an attachment removes it everywhere.**
  - Object gone from R2 and row gone from D1; the download URL 404s afterwards.

### Phase 4 — caching

- **As a user, project stats load fast, and I can see why.**
  - First load: `X-DevBoard-Cache: MISS`, and the bar shows a higher duration.
  - Immediate reload: `HIT`, materially faster.
  - Editing a task purges the cache; the next load is a `MISS` again.
  - Clicking **Purge cache** produces the same effect, visibly.
  - **If KV is unavailable the app still works**, degrading to `BYPASS`. A cache outage is never a 500.

### Phase 5 — realtime

- **As a collaborator, I see others' changes without refreshing.**
  - Two browser windows, same project: moving a card in A updates B in under a second.
  - A new comment in A appears in B's task modal.
  - Presence avatars show who is on the board.
  - Killing the connection shows a reconnecting state; recovery re-syncs board state.
  - My own change does not flicker (the echo of my own broadcast is ignored).

### Phase 6 — activity feed

- **As a user, I can see what happened and when.**
  - Actions appear in the feed within a few seconds, each tagged *Processed via Cloudflare Queue*.
  - Each entry shows its own queue latency (`processed_at − occurred_at`).
  - The feed is chronological, newest first, and paginates by cursor.
  - A forced consumer failure retries and eventually dead-letters, without losing the user's original write.

### Phase 7 — abuse protection

- **As an operator, I am protected from scripted abuse.**
  - Registration without a valid Turnstile token is rejected.
  - A tampered or replayed token is rejected server-side.
  - Six failed logins in a minute return 429 with a `Retry-After` header, and the UI shows a countdown rather than a raw error.
  - Security headers present on every response; CSP does not break the Turnstile widget or the WebSocket.

### Phase 8 — production

- **As anyone, I can use DevBoard on the public internet.**
  - One `wrangler deploy` ships frontend and API together.
  - Custom domain, valid TLS, HTTP/3.
  - Remote migrations applied; a real account can register and use the app.
  - `wrangler tail` shows structured logs for a live request.

---

## 9. What "good" looks like

Beyond the per-phase criteria, DevBoard is done when all of these hold at once:

| Dimension | Bar |
| :--- | :--- |
| **Performance** | Board loads in under 120 ms warm; the budget table in [architecture.md](./architecture.md#11-performance-budget) is met |
| **Correctness** | No stale cache is ever visible after a mutation; no orphaned R2 object is ever *referenced* |
| **Resilience** | KV, R2, DO, or Queue failing degrades a feature; only D1 failing breaks a write |
| **Legibility** | A reader can trace any user action to the Cloudflare APIs it calls without leaving the route file |
| **Accessibility** | Every board operation is reachable by keyboard; realtime updates are announced to screen readers |
| **Verifiability** | Every claim in these docs has a test or a manual script in [testing.md](./testing.md) |

---

## 10. Open product questions

Deliberately unresolved; revisit when the phase that forces the answer arrives.

- **Invitations.** Phase 2 gives projects a membership table but no invite flow. Simplest path: add a member by email address, no acceptance step. Decide in Phase 5, when a second user first genuinely matters.
- **Board size.** No pagination on tasks. A 500-task project will render 500 cards. Virtualisation is deferred until it is a real problem.
- **Presence granularity.** "Viewing this board" is cheap. "Viewing task #4" is a richer signal and more chatter. Phase 5 ships board-level; task-level is a stretch goal.
- **Activity retention.** The log grows forever. A Cron Trigger pruning entries older than 90 days is listed post-v1.
