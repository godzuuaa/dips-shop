-- =============================================
-- Performance Optimization - Database Indexes
-- Run this in Supabase SQL Editor
-- =============================================

-- Indexes for Users Table
CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Indexes for Wallets Table
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_balance ON wallets(balance);

-- Indexes for Transactions Table
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at DESC);

-- Indexes for Products Table
CREATE INDEX IF NOT EXISTS idx_products_product_id ON products(product_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_category_active ON products(category, is_active);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);

-- Indexes for Orders Table
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);

-- Indexes for Coupons Table
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_is_active ON coupons(is_active);
CREATE INDEX IF NOT EXISTS idx_coupons_expires_at ON coupons(expires_at);

-- Indexes for Product Stocks Table (Already exists but adding more)
CREATE INDEX IF NOT EXISTS idx_product_stocks_product_id ON product_stocks(product_id);
CREATE INDEX IF NOT EXISTS idx_product_stocks_is_sold ON product_stocks(is_sold);
CREATE INDEX IF NOT EXISTS idx_product_stocks_sold_to ON product_stocks(sold_to);
CREATE INDEX IF NOT EXISTS idx_product_stocks_order_id ON product_stocks(order_id);
CREATE INDEX IF NOT EXISTS idx_product_stocks_product_available ON product_stocks(product_id, is_sold);

-- =============================================
-- Composite Indexes for Complex Queries
-- =============================================

-- สำหรับ query สินค้าที่ active และมี stock
CREATE INDEX IF NOT EXISTS idx_products_active_stock ON products(is_active, stock) WHERE is_active = true;

-- สำหรับ query transactions ของ user แบบ filter type
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date ON transactions(user_id, type, created_at DESC);

-- สำหรับ query stock ที่ยังไม่ขายของแต่ละ product
CREATE INDEX IF NOT EXISTS idx_stocks_product_unsold ON product_stocks(product_id, is_sold) WHERE is_sold = false;

-- =============================================
-- Full Text Search Indexes (Optional)
-- =============================================

-- สำหรับค้นหาสินค้า
-- CREATE INDEX IF NOT EXISTS idx_products_search ON products USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- =============================================
-- Analyze Tables (Update Statistics)
-- =============================================

ANALYZE users;
ANALYZE wallets;
ANALYZE transactions;
ANALYZE products;
ANALYZE orders;
ANALYZE coupons;
ANALYZE product_stocks;

-- =============================================
-- Success Message
-- =============================================

SELECT 'Database indexes created successfully! Performance improved.' AS message;
