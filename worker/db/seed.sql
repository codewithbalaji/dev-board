-- DevBoard local seed data.
-- Run only against --local:
--   npx wrangler d1 execute devboard-db --local --file worker/db/seed.sql
-- Never run against --remote.

-- alice@devboard.test / password: password123
INSERT INTO users (id, email, display_name, password_hash, password_salt) VALUES
  ('11111111-1111-4111-8111-111111111111', 'alice@devboard.test', 'Alice Kim', 'enrgX2KAgIrlh+EyQt5BDPwDr9s609D3B/UpG/17pZ8=', 'CuH5AXv44eIzqKC6IAHwlQ==');

-- bob@devboard.test / password: password123
INSERT INTO users (id, email, display_name, password_hash, password_salt) VALUES
  ('22222222-2222-4222-8222-222222222222', 'bob@devboard.test', 'Bob Ruiz', 'QSdQTp5cJ15pTLASlNgNwx7Jj3bHv4KN4VzSuOpR2dY=', 'v/jZSeaFq8TVv3Q3L7+WoQ==');

INSERT INTO projects (id, name, slug, description, owner_id) VALUES
  ('33333333-3333-4333-8333-333333333333', 'Acme Redesign', 'acme-redesign', 'Rebuilding the Acme marketing site.', '11111111-1111-4111-8111-111111111111');

INSERT INTO project_members (project_id, user_id, role) VALUES
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 'member');

-- todo
INSERT INTO tasks (id, project_id, title, description, status, priority, position, assignee_id, created_by) VALUES
  ('44444444-4444-4444-8444-444444444401', '33333333-3333-4333-8333-333333333333', 'Draft homepage copy', 'New hero section and value props.', 'todo', 'high', 1000, '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'),
  ('44444444-4444-4444-8444-444444444402', '33333333-3333-4333-8333-333333333333', 'Audit existing analytics events', NULL, 'todo', 'low', 2000, NULL, '22222222-2222-4222-8222-222222222222'),
  ('44444444-4444-4444-8444-444444444403', '33333333-3333-4333-8333-333333333333', 'Collect competitor screenshots', NULL, 'todo', 'medium', 3000, '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111'),
  ('44444444-4444-4444-8444-444444444404', '33333333-3333-4333-8333-333333333333', 'Pick a font pairing', NULL, 'todo', 'medium', 4000, NULL, '11111111-1111-4111-8111-111111111111'),
  ('44444444-4444-4444-8444-444444444405', '33333333-3333-4333-8333-333333333333', 'Write pricing page outline', NULL, 'todo', 'urgent', 5000, '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');

-- in_progress
INSERT INTO tasks (id, project_id, title, description, status, priority, position, assignee_id, created_by) VALUES
  ('44444444-4444-4444-8444-444444444406', '33333333-3333-4333-8333-333333333333', 'Build navbar component', 'Sticky, responsive, theme-aware.', 'in_progress', 'high', 1000, '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111'),
  ('44444444-4444-4444-8444-444444444407', '33333333-3333-4333-8333-333333333333', 'Set up design tokens', NULL, 'in_progress', 'medium', 2000, '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'),
  ('44444444-4444-4444-8444-444444444408', '33333333-3333-4333-8333-333333333333', 'Wire up contact form', NULL, 'in_progress', 'medium', 3000, '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222');

-- done
INSERT INTO tasks (id, project_id, title, description, status, priority, position, assignee_id, created_by) VALUES
  ('44444444-4444-4444-8444-444444444409', '33333333-3333-4333-8333-333333333333', 'Kickoff meeting notes', NULL, 'done', 'low', 1000, '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'),
  ('44444444-4444-4444-8444-444444444410', '33333333-3333-4333-8333-333333333333', 'Register acme-redesign.dev domain', NULL, 'done', 'medium', 2000, '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111'),
  ('44444444-4444-4444-8444-444444444411', '33333333-3333-4333-8333-333333333333', 'Choose hosting provider', NULL, 'done', 'medium', 3000, '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'),
  ('44444444-4444-4444-8444-444444444412', '33333333-3333-4333-8333-333333333333', 'Share brand guidelines with team', NULL, 'done', 'low', 4000, NULL, '11111111-1111-4111-8111-111111111111');

INSERT INTO comments (id, task_id, author_id, body) VALUES
  ('55555555-5555-4555-8555-555555555501', '44444444-4444-4444-8444-444444444406', '11111111-1111-4111-8111-111111111111', 'Let''s keep the collapsed mobile menu simple — a single sheet, no nested accordions.'),
  ('55555555-5555-4555-8555-555555555502', '44444444-4444-4444-8444-444444444406', '22222222-2222-4222-8222-222222222222', 'Agreed. Pushing a first pass today.'),
  ('55555555-5555-4555-8555-555555555503', '44444444-4444-4444-8444-444444444401', '22222222-2222-4222-8222-222222222222', 'Draft looks good — can we lead with the pricing callout instead?');
