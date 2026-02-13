-- Sessions table สำหรับเก็บ session data
-- ใช้แทน MemoryStore ใน production

CREATE TABLE IF NOT EXISTS sessions (
    sid VARCHAR(255) PRIMARY KEY,
    sess JSONB NOT NULL,
    expire TIMESTAMPTZ NOT NULL
);

-- Index สำหรับ cleanup expired sessions
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions (expire);

-- Function สำหรับ cleanup expired sessions (รันทุกชั่วโมง)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM sessions WHERE expire < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policy
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Service role สามารถจัดการ sessions ได้
CREATE POLICY "Service role can manage sessions"
ON sessions FOR ALL
USING (true)
WITH CHECK (true);
