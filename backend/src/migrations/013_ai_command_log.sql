-- AI command log: every assistant request, the commands it produced, what was rejected and what the contractor
-- did with them (executed, rejected, undone). The audit trail behind undo/redo and rollback.
CREATE TABLE IF NOT EXISTS ai_command_log (
  id              text PRIMARY KEY DEFAULT new_id(),
  user_id         text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id      text REFERENCES studio_projects(id) ON DELETE SET NULL,
  design_id       text REFERENCES studio_designs(id) ON DELETE SET NULL,
  design_version  int,
  message         text NOT NULL,
  engine          text NOT NULL,                       -- 'claude' | 'cache'
  reply           text,
  commands        jsonb NOT NULL DEFAULT '[]'::jsonb,  -- validated commands with confirmation info
  rejected        jsonb NOT NULL DEFAULT '[]'::jsonb,  -- commands that failed validation, with reasons
  status          text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'executed', 'partially-executed', 'rejected', 'undone', 'redone')),
  history         jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{ status, at, version?, note? }]
  created_date    timestamptz NOT NULL DEFAULT now(),
  updated_date    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_command_log_project_idx ON ai_command_log(project_id, created_date DESC);
CREATE INDEX IF NOT EXISTS ai_command_log_user_idx ON ai_command_log(user_id, created_date DESC);
