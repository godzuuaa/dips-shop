-- =============================================
-- Dips Hub - Database Schema for Supabase
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Users Table (เก็บข้อมูล Discord users)
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    discord_id TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    email TEXT,
    avatar TEXT,
    discriminator TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Wallets Table (เก็บยอดเงิน)
CREATE TABLE IF NOT EXISTS wallets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL, -- discord_id
    balance DECIMAL(12, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Transactions Table (ประวัติธุรกรรม)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_id TEXT UNIQUE NOT NULL, -- TXN + timestamp
    user_id TEXT NOT NULL, -- discord_id
    type TEXT NOT NULL CHECK (type IN ('topup', 'purchase', 'refund')),
    amount DECIMAL(12, 2) NOT NULL,
    balance_after DECIMAL(12, 2) NOT NULL,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Products Table (สินค้า)
CREATE TABLE IF NOT EXISTS products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(12, 2) NOT NULL,
    original_price DECIMAL(12, 2),
    category TEXT NOT NULL,
    image TEXT,
    stock INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    features JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Orders Table (คำสั่งซื้อ)
CREATE TABLE IF NOT EXISTS orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id TEXT UNIQUE NOT NULL, -- ORD + timestamp
    user_id TEXT NOT NULL, -- discord_id
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    price DECIMAL(12, 2) NOT NULL,
    total DECIMAL(12, 2) NOT NULL,
    status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled', 'refunded')),
    delivery_data JSONB DEFAULT '{}', -- เก็บ key/code ที่ส่งให้ลูกค้า
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Coupons Table (คูปอง)
CREATE TABLE IF NOT EXISTS coupons (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('fixed', 'percent')),
    value DECIMAL(12, 2) NOT NULL,
    min_amount DECIMAL(12, 2) DEFAULT 0,
    max_uses INTEGER DEFAULT 1,
    used_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Product Stocks Table (เก็บ Key/Code สำหรับ Auto Delivery)
CREATE TABLE IF NOT EXISTS product_stocks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id TEXT NOT NULL,
    stock_type TEXT DEFAULT 'key' CHECK (stock_type IN ('key', 'user_pass', 'user_pass_cookie')), -- ประเภทของ stock
    stock_data TEXT NOT NULL, -- Key, Code, หรือข้อมูลที่จะส่งให้ลูกค้า
    username TEXT, -- สำหรับ user_pass และ user_pass_cookie
    password TEXT, -- สำหรับ user_pass และ user_pass_cookie
    cookie TEXT, -- สำหรับ user_pass_cookie
    is_sold BOOLEAN DEFAULT false,
    sold_to TEXT, -- discord_id ของผู้ซื้อ
    sold_at TIMESTAMP WITH TIME ZONE,
    order_id TEXT, -- เชื่อมกับ orders table
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add stock_type column if not exists (for existing databases)
-- ALTER TABLE product_stocks ADD COLUMN IF NOT EXISTS stock_type TEXT DEFAULT 'key';
-- ALTER TABLE product_stocks ADD COLUMN IF NOT EXISTS username TEXT;
-- ALTER TABLE product_stocks ADD COLUMN IF NOT EXISTS password TEXT;
-- ALTER TABLE product_stocks ADD COLUMN IF NOT EXISTS cookie TEXT;

-- Index for product_stocks
CREATE INDEX IF NOT EXISTS idx_product_stocks_product_id ON product_stocks(product_id);
CREATE INDEX IF NOT EXISTS idx_product_stocks_is_sold ON product_stocks(is_sold);

-- =============================================
-- Indexes for better performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);

-- =============================================
-- Functions
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_wallets_updated_at ON wallets;
CREATE TRIGGER update_wallets_updated_at
    BEFORE UPDATE ON wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- Row Level Security (RLS)
-- =============================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (ถ้ามี)
DROP POLICY IF EXISTS "Products are viewable by everyone" ON products;
DROP POLICY IF EXISTS "Service role has full access to users" ON users;
DROP POLICY IF EXISTS "Service role has full access to wallets" ON wallets;
DROP POLICY IF EXISTS "Service role has full access to transactions" ON transactions;
DROP POLICY IF EXISTS "Service role has full access to products" ON products;
DROP POLICY IF EXISTS "Service role has full access to orders" ON orders;
DROP POLICY IF EXISTS "Service role has full access to coupons" ON coupons;

-- Enable RLS on product_stocks
ALTER TABLE product_stocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role has full access to product_stocks" ON product_stocks;

-- Products: Anyone can read active products
CREATE POLICY "Products are viewable by everyone" ON products
    FOR SELECT USING (is_active = true);

-- Service role can do everything (for backend)
CREATE POLICY "Service role has full access to users" ON users
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to wallets" ON wallets
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to transactions" ON transactions
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to products" ON products
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to orders" ON orders
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to coupons" ON coupons
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to product_stocks" ON product_stocks
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- Sample Data (Optional)
-- =============================================

-- Sample Products
INSERT INTO products (product_id, name, description, price, original_price, category, stock, features) VALUES
('PROD001', 'Blox Fruits - Leopard', 'Leopard Fruit สำหรับ Blox Fruits', 299, 399, 'roblox-id', 10, '["Instant Delivery", "24/7 Support"]'),
('PROD002', 'Blox Fruits - Dragon', 'Dragon Fruit สำหรับ Blox Fruits', 249, 349, 'roblox-id', 15, '["Instant Delivery", "24/7 Support"]'),
('PROD003', 'Solara Key - 1 Day', 'Key Script Solara 1 วัน', 29, null, 'key-script', 999, '["Auto Delivery", "Works 24h"]'),
('PROD004', 'Solara Key - 7 Days', 'Key Script Solara 7 วัน', 149, 199, 'key-script', 999, '["Auto Delivery", "Works 7 days"]'),
('PROD005', 'VIP Membership', 'สมาชิก VIP ตลอดชีพ', 999, 1499, 'limited', 5, '["Lifetime Access", "Priority Support", "Exclusive Items"]')
ON CONFLICT (product_id) DO NOTHING;
