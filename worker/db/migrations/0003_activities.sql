-- DevBoard 0003_activities
-- Append-only activity log, written exclusively by the Queue consumer.

CREATE TABLE activities (
  id           TEXT    PRIMARY KEY,
  project_id   TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_id     TEXT    REFERENCES users(id) ON DELETE SET NULL,
  type         TEXT    NOT NULL,
  entity_type  TEXT    NOT NULL
                       CHECK (entity_type IN ('project', 'task', 'comment', 'attachment')),
  entity_id    TEXT,
  payload      TEXT    NOT NULL DEFAULT '{}',
  occurred_at  INTEGER NOT NULL,
  processed_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_activities_project ON activities(project_id, occurred_at DESC);
