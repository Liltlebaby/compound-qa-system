-- Snapshot JSON and ISO timestamps retain their exact text for historical fingerprints.
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"stations" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL
);
CREATE TABLE "rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"shift" text NOT NULL,
	"line" text NOT NULL,
	"start" text NOT NULL,
	"end" text NOT NULL,
	"end_at" text NOT NULL,
	"snapshot" text NOT NULL,
	"created_at" text NOT NULL
);
CREATE TABLE "workspace" (
	"id" integer PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"config" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
CREATE TABLE "requests" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"body_hash" text NOT NULL,
	"created_at" text NOT NULL
);
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"round_id" text NOT NULL,
	"order_id" text NOT NULL,
	"station_id" text NOT NULL,
	"payload" text NOT NULL,
	"operator_id" text NOT NULL,
	"operator_name" text NOT NULL,
	"submitted_at" text NOT NULL,
	"version" integer NOT NULL,
	"last_request_id" text NOT NULL,
	FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON UPDATE no action ON DELETE no action
);
CREATE TABLE "audits" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"round_id" text NOT NULL,
	"station_id" text NOT NULL,
	"order_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"at" text NOT NULL,
	"before" text,
	"after" text NOT NULL,
	"reason" text NOT NULL
);
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"round_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"revision" integer NOT NULL,
	"text" text NOT NULL,
	"source" text NOT NULL,
	"completed_at" text NOT NULL,
	"created_at" text NOT NULL,
	"changes" text NOT NULL,
	"facts" text NOT NULL,
	FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON UPDATE no action ON DELETE no action
);
CREATE TABLE "settings_audits" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"at" text NOT NULL,
	"action" text NOT NULL,
	"details" text NOT NULL
);
CREATE UNIQUE INDEX "members_email_unique" ON "members" ("email");
CREATE UNIQUE INDEX "report_content" ON "reports" ("round_id","fingerprint");
CREATE UNIQUE INDEX "report_revision" ON "reports" ("round_id","revision");
CREATE UNIQUE INDEX "submission_slot" ON "submissions" ("round_id","order_id","station_id");
ALTER TABLE "members" ADD "factories" text DEFAULT '["AJ2","AJ2B"]' NOT NULL;
ALTER TABLE "rounds" ADD "factory" text DEFAULT 'AJ2' NOT NULL;
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

CREATE TABLE station_accounts (
  id TEXT PRIMARY KEY NOT NULL REFERENCES members(id),
  factory TEXT NOT NULL,
  shift TEXT NOT NULL,
  line TEXT NOT NULL,
  station_id TEXT NOT NULL,
  UNIQUE(factory,shift,line,station_id)
);

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

ALTER TABLE qa_alarms ADD COLUMN resolution_method TEXT;
ALTER TABLE qa_alarms ADD COLUMN resolved_by TEXT;
ALTER TABLE qa_alarms ADD COLUMN resolved_name TEXT;
ALTER TABLE qa_alarms ADD COLUMN resolution_note TEXT;
ALTER TABLE qa_alarms ADD COLUMN resolution_request_id TEXT;


CREATE TABLE auth_users (id text PRIMARY KEY, username text UNIQUE NOT NULL, email text UNIQUE NOT NULL, salt text NOT NULL, password_hash text NOT NULL);
CREATE TABLE auth_sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES auth_users(id), expires_at text NOT NULL);
CREATE TABLE server_settings (name text PRIMARY KEY, value text NOT NULL);
CREATE INDEX rounds_scope_date ON rounds(factory,shift,date,line,start);
CREATE INDEX submissions_round ON submissions(round_id);
CREATE INDEX submissions_request ON submissions(last_request_id);
CREATE INDEX audits_round ON audits(round_id,at);
CREATE INDEX reports_round_created ON reports(round_id,created_at);
CREATE INDEX sessions_expiry ON auth_sessions(expires_at);
