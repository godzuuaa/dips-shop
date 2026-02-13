-- =============================================
-- Topup Requests Table
-- ระบบเติมเงินที่ต้อง Admin approve
-- =============================================

-- สร้าง Table สำหรับเก็บ Topup Requests
CREATE TABLE IF NOT EXISTS topup_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id TEXT UNIQUE NOT NULL, -- REQ + timestamp
    user_id TEXT NOT NULL, -- discord_id
    amount DECIMAL(12, 2) NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('promptpay', 'truemoney', 'bank_transfer')),
    slip_url TEXT, -- URL ของสลิปโอนเงิน
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    admin_note TEXT, -- หมายเหตุจาก admin
    reviewed_by TEXT, -- discord_id ของ admin ที่ review
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_topup_requests_user_id ON topup_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_topup_requests_status ON topup_requests(status);
CREATE INDEX IF NOT EXISTS idx_topup_requests_created_at ON topup_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topup_requests_pending ON topup_requests(status) WHERE status = 'pending';

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_topup_requests_updated_at ON topup_requests;
CREATE TRIGGER update_topup_requests_updated_at
    BEFORE UPDATE ON topup_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE topup_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Service role has full access to topup_requests" ON topup_requests;
CREATE POLICY "Service role has full access to topup_requests" ON topup_requests
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- Success Message
-- =============================================
SELECT 'Topup requests table created successfully!' AS message;
