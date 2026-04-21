-- Track current-email verification sends for cooldown and quota enforcement.
ALTER TABLE users ADD COLUMN verification_email_sent_at DATETIME;
ALTER TABLE users ADD COLUMN verification_email_send_window_start DATETIME;
ALTER TABLE users ADD COLUMN verification_email_send_count INTEGER DEFAULT 0;
