-- A project with no parent is a root project. The index serves listing one project's children.
ALTER TABLE project
  ADD COLUMN parent_id VARCHAR(36) NULL,
  ADD INDEX idx_project_2 (username, parent_id);
