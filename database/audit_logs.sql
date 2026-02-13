-- =============================================
-- Audit Logs Table - เก็บ Log การกระทำของ Admin
-- Run this in Supabase SQL Editor
-- =============================================

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL, -- discord_id ของผู้กระทำ
    username TEXT, -- username สำหรับแสดง
    action TEXT NOT NULL, -- create, update, delete, topup, etc.
    resource_type TEXT NOT NULL, -- product, user, order, stock, etc.
    resource_id TEXT, -- ID ของ resource ที่ถูกกระทำ
    old_value JSONB, -- ค่าเก่า (สำหรับ update/delete)
    new_value JSONB, -- ค่าใหม่ (สำหรับ create/update)
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Service role policy
DROP POLICY IF EXISTS "Service role has full access to audit_logs" ON audit_logs;
CREATE POLICY "Service role has full access to audit_logs" ON audit_logs
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- Security Events Table - เก็บ Log เหตุการณ์ความปลอดภัย
-- =============================================

CREATE TABLE IF NOT EXISTS security_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type TEXT NOT NULL, -- login_failed, suspicious_activity, ip_blocked, etc.
    severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    user_id TEXT, -- discord_id (ถ้ามี)
    ip_address TEXT,
    user_agent TEXT,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC);

-- Enable RLS
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Service role policy
DROP POLICY IF EXISTS "Service role has full access to security_events" ON security_events;
CREATE POLICY "Service role has full access to security_events" ON security_events
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- Function: Clean old logs (เก็บแค่ 90 วัน)
-- =============================================

CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';
    DELETE FROM security_events WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- สามารถตั้ง cron job ใน Supabase Dashboard เพื่อรัน cleanup_old_logs() ทุกวัน
