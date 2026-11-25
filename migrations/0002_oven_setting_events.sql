CREATE TABLE IF NOT EXISTS oven_setting_events (
 submission_id TEXT PRIMARY KEY REFERENCES submissions(id),
 round_id TEXT NOT NULL REFERENCES rounds(id),
 order_id TEXT NOT NULL,
 factory TEXT NOT NULL,
 shift TEXT NOT NULL,
 line TEXT NOT NULL,
 epoch TEXT NOT NULL,
 effective_at TEXT NOT NULL,
 changes TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS oven_settings_scope ON oven_setting_events(factory,shift,line,order_id,epoch,effective_at);
