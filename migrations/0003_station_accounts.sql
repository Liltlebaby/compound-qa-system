CREATE TABLE station_accounts (
  id TEXT PRIMARY KEY NOT NULL REFERENCES members(id),
  factory TEXT NOT NULL,
  shift TEXT NOT NULL,
  line TEXT NOT NULL,
  station_id TEXT NOT NULL,
  UNIQUE(factory,shift,line,station_id)
);
