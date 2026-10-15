CREATE TABLE IF NOT EXISTS guidance_requests(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,session_id TEXT NOT NULL REFERENCES guidance_sessions(id) ON DELETE CASCADE,snapshot TEXT NOT NULL,result TEXT NOT NULL DEFAULT '',state TEXT NOT NULL,base_version INTEGER NOT NULL,stale INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,ended_at TEXT);
CREATE INDEX IF NOT EXISTS guidance_requests_session ON guidance_requests(owner,session_id,created_at);
INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(3,datetime('now'));
