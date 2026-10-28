CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS theory_sections (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content_md TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  -- NULL = глава связана с центром (заданием) на mind map
  parent_id INTEGER REFERENCES theory_sections(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('example', 'practice')),
  statement_md TEXT NOT NULL DEFAULT '',
  solution_md TEXT NOT NULL DEFAULT '',  -- короткий ответ для проверки (только тренировка)
  explanation_md TEXT NOT NULL DEFAULT '',  -- разбор решения, показывается под катом
  solved INTEGER NOT NULL DEFAULT 0,  -- правильный ответ зафиксирован (тренировка)
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS progress (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('theory', 'problems', 'practice')),
  done INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (task_id, section)
);
