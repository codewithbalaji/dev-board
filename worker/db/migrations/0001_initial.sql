-- DevBoard 0001_initial
-- Users, projects, membership, tasks, comments.
-- All timestamps are Unix seconds (INTEGER). All ids are UUID v4 (TEXT).

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- users
CREATE TABLE users (
  id            TEXT    PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE,
  display_name  TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,          -- base64 PBKDF2-SHA256 derived key
  password_salt TEXT    NOT NULL,          -- base64, 16 random bytes, per user
  avatar_color  TEXT    NOT NULL DEFAULT 'neutral',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ------------------------------------------------------------- projects
CREATE TABLE projects (
  id          TEXT    PRIMARY KEY,
  name        TEXT    NOT NULL,
  slug        TEXT    NOT NULL,
  description TEXT,
  color       TEXT    NOT NULL DEFAULT 'neutral',
  owner_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archived_at INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX        idx_projects_owner      ON projects(owner_id);
CREATE UNIQUE INDEX idx_projects_owner_slug ON projects(owner_id, slug);

-- ------------------------------------------------------- project_members
CREATE TABLE project_members (
  project_id TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT    NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  role       TEXT    NOT NULL DEFAULT 'member'
                     CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX idx_project_members_user ON project_members(user_id);

-- ---------------------------------------------------------------- tasks
CREATE TABLE tasks (
  id          TEXT    PRIMARY KEY,
  project_id  TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  description TEXT,
  status      TEXT    NOT NULL DEFAULT 'todo'
                      CHECK (status IN ('todo', 'in_progress', 'done')),
  priority    TEXT    NOT NULL DEFAULT 'medium'
                      CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  position    REAL    NOT NULL DEFAULT 1000,
  assignee_id TEXT    REFERENCES users(id) ON DELETE SET NULL,
  created_by  TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  due_at      INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Covers the hot query: one board's column, in order.
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status, position);
CREATE INDEX idx_tasks_assignee       ON tasks(assignee_id);

-- ------------------------------------------------------------- comments
CREATE TABLE comments (
  id         TEXT    PRIMARY KEY,
  task_id    TEXT    NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_comments_task ON comments(task_id, created_at);
