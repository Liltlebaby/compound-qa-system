CREATE TABLE qa_alarms (
 id TEXT PRIMARY KEY, round_id TEXT NOT NULL REFERENCES rounds(id), order_id TEXT NOT NULL,
 station_id TEXT NOT NULL, field_key TEXT NOT NULL, kind TEXT NOT NULL, severity TEXT NOT NULL,
 status TEXT NOT NULL, message TEXT NOT NULL, details TEXT NOT NULL,
 first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL, resolved_at TEXT,
 acknowledged_by TEXT, acknowledged_name TEXT, acknowledged_at TEXT, ack_note TEXT, ack_request_id TEXT
);
CREATE INDEX qa_alarms_round ON qa_alarms(round_id,station_id,status);
CREATE TABLE qa_alarm_events (
 id TEXT PRIMARY KEY, alarm_id TEXT NOT NULL REFERENCES qa_alarms(id), at TEXT NOT NULL,
 actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, action TEXT NOT NULL, note TEXT NOT NULL
);
