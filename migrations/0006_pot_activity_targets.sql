-- Link activity events to the detail-page object that should display the marker.
ALTER TABLE pot_activity_events ADD COLUMN target_type TEXT;
ALTER TABLE pot_activity_events ADD COLUMN target_id TEXT;

CREATE INDEX IF NOT EXISTS idx_pot_activity_events_target
  ON pot_activity_events(pot_id, target_type, target_id);
