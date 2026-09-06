-- DevBoard 0002_attachments
-- Metadata rows for objects stored in R2. Bytes never live in D1.

CREATE TABLE attachments (
  id          TEXT    PRIMARY KEY,
  task_id     TEXT    NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_key    TEXT    NOT NULL UNIQUE,
  filename    TEXT    NOT NULL,
  size        INTEGER NOT NULL,
  mime_type   TEXT    NOT NULL,
  uploaded_by TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_attachments_task ON attachments(task_id, created_at);
