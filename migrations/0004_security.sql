PRAGMA foreign_keys = ON;

CREATE TABLE security_rate_limits (
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL CHECK (length(key_hash) = 64),
  bucket_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  expires_at TEXT NOT NULL,
  PRIMARY KEY (scope, key_hash, bucket_start)
) STRICT;

CREATE INDEX idx_security_rate_limits_expiry ON security_rate_limits(expires_at);
