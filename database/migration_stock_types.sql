-- =============================================
-- Migration: Add stock_type support to product_stocks
-- รองรับ 3 ประเภท: key, user_pass, user_pass_cookie
-- =============================================

-- เพิ่ม column stock_type (ประเภทของ stock)
ALTER TABLE product_stocks 
ADD COLUMN IF NOT EXISTS stock_type TEXT DEFAULT 'key' 
CHECK (stock_type IN ('key', 'user_pass', 'user_pass_cookie'));

-- เพิ่ม column username สำหรับเก็บ username
ALTER TABLE product_stocks 
ADD COLUMN IF NOT EXISTS username TEXT;

-- เพิ่ม column password สำหรับเก็บ password
ALTER TABLE product_stocks 
ADD COLUMN IF NOT EXISTS password TEXT;

-- เพิ่ม column cookie สำหรับเก็บ cookie (สำหรับ Roblox หรืออื่นๆ)
ALTER TABLE product_stocks 
ADD COLUMN IF NOT EXISTS cookie TEXT;

-- Index สำหรับ stock_type
CREATE INDEX IF NOT EXISTS idx_product_stocks_stock_type ON product_stocks(stock_type);

-- Comment อธิบายการใช้งาน
COMMENT ON COLUMN product_stocks.stock_type IS 'ประเภท stock: key = Key/Code ธรรมดา, user_pass = Username:Password, user_pass_cookie = Username:Password:Cookie';
COMMENT ON COLUMN product_stocks.username IS 'Username สำหรับ user_pass และ user_pass_cookie';
COMMENT ON COLUMN product_stocks.password IS 'Password สำหรับ user_pass และ user_pass_cookie';
COMMENT ON COLUMN product_stocks.cookie IS 'Cookie สำหรับ user_pass_cookie (เช่น Roblox .ROBLOSECURITY)';
