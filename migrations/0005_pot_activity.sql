-- Per-pot activity markers for compact homepage "new activity" hints.
CREATE TABLE IF NOT EXISTS pot_activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pot_id TEXT NOT NULL,
  actor_id TEXT,
  type TEXT NOT NULL,
  summary TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pot_id) REFERENCES pots(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pot_activity_reads (
  user_id TEXT NOT NULL,
  pot_id TEXT NOT NULL,
  last_read_event_id INTEGER DEFAULT 0,
  read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, pot_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (pot_id) REFERENCES pots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pot_activity_events_pot_id
  ON pot_activity_events(pot_id, id);

CREATE INDEX IF NOT EXISTS idx_pot_activity_events_actor
  ON pot_activity_events(actor_id);
