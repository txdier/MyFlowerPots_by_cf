-- Performance indexes for message badges, comments, and care-record views.

CREATE INDEX IF NOT EXISTS idx_messages_user_status
  ON messages(user_id, status);

CREATE INDEX IF NOT EXISTS idx_messages_related_type_created
  ON messages(related_id, type, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_pot_comments_pot_created_id
  ON pot_comments(pot_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_care_records_pot_date_type
  ON care_records(pot_id, care_date, type);
