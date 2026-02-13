-- =============================================
-- Stock Locking Functions
-- ป้องกัน Race Condition ในการซื้อสินค้า
-- =============================================

-- Function: Reserve stock with locking
-- ใช้ FOR UPDATE SKIP LOCKED เพื่อป้องกัน 2 คนซื้อ stock เดียวกัน
CREATE OR REPLACE FUNCTION reserve_stock(
    p_product_id TEXT,
    p_quantity INT,
    p_user_id TEXT
)
RETURNS TABLE (
    stock_id UUID,
    stock_data TEXT
) AS $$
DECLARE
    v_stock RECORD;
    v_count INT := 0;
BEGIN
    -- Lock และดึง stock ที่ยังไม่ขาย
    FOR v_stock IN
        SELECT id, product_stocks.stock_data
        FROM product_stocks
        WHERE product_id = p_product_id 
          AND is_sold = false
        ORDER BY created_at ASC
        LIMIT p_quantity
        FOR UPDATE SKIP LOCKED
    LOOP
        v_count := v_count + 1;
        stock_id := v_stock.id;
        stock_data := v_stock.stock_data;
        RETURN NEXT;
    END LOOP;
    
    -- ตรวจสอบว่าได้ stock ครบตามจำนวนหรือไม่
    IF v_count < p_quantity THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Available %, Requested %', v_count, p_quantity;
    END IF;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Function: Complete purchase (all in one transaction)
-- ทำทุกอย่างใน single transaction เพื่อป้องกันข้อมูลไม่ consistent
CREATE OR REPLACE FUNCTION complete_purchase(
    p_user_id TEXT,
    p_product_id TEXT,
    p_quantity INT,
    p_price_per_unit DECIMAL,
    p_product_name TEXT
)
RETURNS JSON AS $$
DECLARE
    v_total DECIMAL;
    v_current_balance DECIMAL;
    v_new_balance DECIMAL;
    v_order_id TEXT;
    v_transaction_id TEXT;
    v_stock_ids UUID[];
    v_stock_data TEXT[];
    v_stock RECORD;
    v_result JSON;
BEGIN
    -- คำนวณราคารวม
    v_total := p_price_per_unit * p_quantity;
    v_order_id := 'ORD' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT;
    v_transaction_id := 'TXN' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT;
    
    -- 1. ตรวจสอบยอดเงิน
    SELECT balance INTO v_current_balance
    FROM wallets
    WHERE user_id = p_user_id
    FOR UPDATE; -- Lock wallet row
    
    IF v_current_balance IS NULL THEN
        RAISE EXCEPTION 'WALLET_NOT_FOUND: User % has no wallet', p_user_id;
    END IF;
    
    IF v_current_balance < v_total THEN
        RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Balance %, Required %', v_current_balance, v_total;
    END IF;
    
    -- 2. Reserve stock with lock
    v_stock_ids := ARRAY[]::UUID[];
    v_stock_data := ARRAY[]::TEXT[];
    
    FOR v_stock IN
        SELECT id, product_stocks.stock_data
        FROM product_stocks
        WHERE product_id = p_product_id 
          AND is_sold = false
        ORDER BY created_at ASC
        LIMIT p_quantity
        FOR UPDATE SKIP LOCKED
    LOOP
        v_stock_ids := array_append(v_stock_ids, v_stock.id);
        v_stock_data := array_append(v_stock_data, v_stock.stock_data);
    END LOOP;
    
    -- ตรวจสอบว่าได้ stock ครบ
    IF array_length(v_stock_ids, 1) IS NULL OR array_length(v_stock_ids, 1) < p_quantity THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Available %, Requested %', 
            COALESCE(array_length(v_stock_ids, 1), 0), p_quantity;
    END IF;
    
    -- 3. หักเงิน
    v_new_balance := v_current_balance - v_total;
    UPDATE wallets 
    SET balance = v_new_balance, updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- 4. Mark stock as sold
    UPDATE product_stocks
    SET 
        is_sold = true,
        sold_to = p_user_id,
        sold_at = NOW(),
        order_id = v_order_id
    WHERE id = ANY(v_stock_ids);
    
    -- 5. สร้าง Order
    INSERT INTO orders (order_id, user_id, product_id, product_name, quantity, price, total, status, delivery_data)
    VALUES (
        v_order_id,
        p_user_id,
        p_product_id,
        p_product_name,
        p_quantity,
        p_price_per_unit,
        v_total,
        'completed',
        jsonb_build_object('items', to_jsonb(v_stock_data), 'deliveredAt', NOW())
    );
    
    -- 6. บันทึก Transaction
    INSERT INTO transactions (transaction_id, user_id, type, amount, balance_after, details)
    VALUES (
        v_transaction_id,
        p_user_id,
        'purchase',
        -v_total,
        v_new_balance,
        jsonb_build_object(
            'productId', p_product_id,
            'productName', p_product_name,
            'orderId', v_order_id,
            'quantity', p_quantity
        )
    );
    
    -- 7. Return result
    v_result := jsonb_build_object(
        'success', true,
        'orderId', v_order_id,
        'transactionId', v_transaction_id,
        'deliveryItems', v_stock_data,
        'total', v_total,
        'newBalance', v_new_balance
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function: Get stock count (optimized)
CREATE OR REPLACE FUNCTION get_available_stock_count(p_product_id TEXT)
RETURNS INT AS $$
    SELECT COUNT(*)::INT 
    FROM product_stocks 
    WHERE product_id = p_product_id AND is_sold = false;
$$ LANGUAGE sql STABLE;

-- =============================================
-- Success Message
-- =============================================
SELECT 'Stock locking functions created successfully!' AS message;
