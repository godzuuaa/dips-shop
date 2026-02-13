require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { supabaseAdmin } = require('./config/supabase');
const SupabaseStore = require('./utils/supabaseSessionStore');

// Cache System
const {
    getCachedProducts,
    invalidateProductsCache,
    getCachedBalance,
    invalidateBalanceCache,
    getCachedStockCount,
    invalidateStockCache,
    getCacheStats,
    clearAllCaches
} = require('./utils/cache');

// Security Middleware
const {
    apiLimiter,
    loginLimiter,
    purchaseLimiter,
    adminLimiter,
    requestLogger,
    detectSuspiciousActivity,
    preventParameterPollution,
    ipBlocker,
    corsOptions
} = require('./middleware/security');

// Validation Middleware
const {
    purchaseValidation,
    topupValidation,
    createProductValidation,
    addStockValidation,
    validate,
    validateWithJoi,
    joiSchemas
} = require('./middleware/validation');

// Audit Logging
const { logAudit, logSecurityEvent, AuditActions, ResourceTypes, SecurityEventTypes } = require('./utils/auditLogger');

// TrueMoney API
const { redeemAngpao, getConfigStatus, validateVoucherFormat } = require('./utils/truemoneyApi');

// Discord Notification
const { notifyAngpaoRequest, notifyAngpaoResult, testWebhook } = require('./utils/discordNotify');

const app = express();
const PORT = process.env.PORT || 3000;
const isDevelopment = process.env.NODE_ENV !== 'production';

// =============================================
// Supabase Database Functions
// =============================================

// ดึงหรือสร้าง Wallet ของ user
async function getOrCreateWallet(userId) {
    try {
        // ลองดึง wallet ที่มีอยู่
        let { data: wallet, error } = await supabaseAdmin
            .from('wallets')
            .select('*')
            .eq('user_id', userId)
            .single();

        // ถ้าไม่มี ให้สร้างใหม่
        if (error && error.code === 'PGRST116') {
            const { data: newWallet, error: createError } = await supabaseAdmin
                .from('wallets')
                .insert({ user_id: userId, balance: 0 })
                .select()
                .single();

            if (createError) throw createError;
            return newWallet;
        }

        if (error) throw error;
        return wallet;
    } catch (error) {
        console.error('Error getting wallet:', error);
        return { user_id: userId, balance: 0 };
    }
}

// ดึงยอดเงินของ user
async function getUserBalance(userId) {
    const wallet = await getOrCreateWallet(userId);
    return parseFloat(wallet.balance) || 0;
}

// อัพเดทยอดเงินของ user
async function updateUserBalance(userId, newBalance) {
    try {
        const { data, error } = await supabaseAdmin
            .from('wallets')
            .upsert({ 
                user_id: userId, 
                balance: newBalance,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' })
            .select()
            .single();

        if (error) throw error;
        return parseFloat(data.balance);
    } catch (error) {
        console.error('Error updating balance:', error);
        return newBalance;
    }
}

// เพิ่ม Transaction
async function addTransaction(userId, type, amount, details = {}) {
    try {
        const balanceAfter = await getUserBalance(userId);
        const transaction = {
            transaction_id: `TXN${Date.now()}`,
            user_id: userId,
            type: type,
            amount: amount,
            balance_after: balanceAfter,
            details: details
        };

        const { data, error } = await supabaseAdmin
            .from('transactions')
            .insert(transaction)
            .select()
            .single();

        if (error) throw error;
        
        // แปลง format ให้ตรงกับ frontend
        return {
            id: data.transaction_id,
            userId: data.user_id,
            type: data.type,
            amount: parseFloat(data.amount),
            balanceAfter: parseFloat(data.balance_after),
            details: data.details,
            timestamp: data.created_at
        };
    } catch (error) {
        console.error('Error adding transaction:', error);
        return null;
    }
}

// ดึง Transactions ของ user
async function getUserTransactions(userId, limit = 10) {
    try {
        const { data, error } = await supabaseAdmin
            .from('transactions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        // แปลง format ให้ตรงกับ frontend
        return data.map(t => ({
            id: t.transaction_id,
            userId: t.user_id,
            type: t.type,
            amount: parseFloat(t.amount),
            balanceAfter: parseFloat(t.balance_after),
            details: t.details,
            timestamp: t.created_at
        }));
    } catch (error) {
        console.error('Error getting transactions:', error);
        return [];
    }
}

// บันทึก/อัพเดท User จาก Discord
async function upsertUser(discordUser) {
    try {
        const { data, error } = await supabaseAdmin
            .from('users')
            .upsert({
                discord_id: discordUser.id,
                username: discordUser.username,
                email: discordUser.email,
                avatar: discordUser.avatar 
                    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
                    : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator || '0') % 5}.png`,
                discriminator: discordUser.discriminator,
                updated_at: new Date().toISOString()
            }, { onConflict: 'discord_id' })
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error upserting user:', error);
        return null;
    }
}

// ดึงสินค้าทั้งหมด (แก้ไข N+1 Query Problem)
async function getProducts(category = null) {
    try {
        let query = supabaseAdmin
            .from('products')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (category) {
            query = query.eq('category', category);
        }

        const { data: products, error } = await query;
        if (error) throw error;
        
        if (!products || products.length === 0) {
            return [];
        }

        // ดึง product_ids ทั้งหมด
        const productIds = products.map(p => p.product_id);

        // Query stock counts ทั้งหมดในครั้งเดียว
        const { data: stockCounts, error: stockError } = await supabaseAdmin
            .from('product_stocks')
            .select('product_id, is_sold')
            .in('product_id', productIds);

        if (stockError) throw stockError;

        // นับ stock แต่ละ product
        const stockMap = {};
        (stockCounts || []).forEach(s => {
            if (!stockMap[s.product_id]) {
                stockMap[s.product_id] = { available: 0, sold: 0 };
            }
            if (s.is_sold) {
                stockMap[s.product_id].sold++;
            } else {
                stockMap[s.product_id].available++;
            }
        });

        // รวม stock data กับ products
        const productsWithRealStock = products.map(product => ({
            ...product,
            stock: stockMap[product.product_id]?.available || 0,
            sales: stockMap[product.product_id]?.sold || 0
        }));
        
        return productsWithRealStock;
    } catch (error) {
        console.error('Error getting products:', error);
        return [];
    }
}

// สินค้าตัวอย่าง (Hardcoded - ใช้เมื่อไม่มีใน database)
const hardcodedProducts = {
    'premium-key-1': { product_id: 'premium-key-1', name: 'DipsHub Premium Key', description: 'Key สำหรับใช้งาน DipsHub Premium ตลอดชีพ', price: 299, category: 'limited-edition', stock: 15, is_active: true },
    'vip-key-1': { product_id: 'vip-key-1', name: 'DipsHub VIP Key', description: 'Key สำหรับใช้งาน DipsHub VIP 30 วัน', price: 149, category: 'limited-edition', stock: 50, is_active: true },
    'starter-key-1': { product_id: 'starter-key-1', name: 'DipsHub Starter Key', description: 'Key สำหรับผู้เริ่มต้น 7 วัน', price: 49, category: 'limited-edition', stock: 100, is_active: true },
    'synapse-key': { product_id: 'synapse-key', name: 'Synapse X Key', description: 'Key สำหรับ Synapse X Executor', price: 599, category: 'executor', stock: 5, is_active: true },
    'scriptware-key': { product_id: 'scriptware-key', name: 'Script-Ware Key', description: 'Key สำหรับ Script-Ware', price: 399, category: 'executor', stock: 20, is_active: true },
    'synapse-hwid': { product_id: 'synapse-hwid', name: 'Synapse X HWID Reset', description: 'รีเซ็ต HWID สำหรับ Synapse X', price: 99, category: 'reset-hwid', stock: 30, is_active: true },
    'scriptware-hwid': { product_id: 'scriptware-hwid', name: 'Script-Ware HWID Reset', description: 'รีเซ็ต HWID สำหรับ Script-Ware', price: 79, category: 'reset-hwid', stock: 25, is_active: true },
    'web-1month': { product_id: 'web-1month', name: 'เช่าเว็บขายสคริป 1 เดือน', description: 'เว็บไซต์ขายสคริปพร้อมระบบหลังบ้าน', price: 499, category: 'website', stock: 10, is_active: true },
    'web-3month': { product_id: 'web-3month', name: 'เช่าเว็บขายสคริป 3 เดือน', description: 'เว็บไซต์ขายสคริป 3 เดือน ราคาพิเศษ', price: 1299, category: 'website', stock: 8, is_active: true }
};

// ดึงสินค้าตาม ID
async function getProductById(productId) {
    try {
        // ลองหาจาก database ก่อน
        const { data, error } = await supabaseAdmin
            .from('products')
            .select('*')
            .eq('product_id', productId)
            .maybeSingle(); // ใช้ maybeSingle แทน single เพื่อไม่ให้ error ถ้าไม่เจอ

        if (data) return data;
        
        // ถ้าไม่เจอใน database ให้ใช้ hardcoded
        if (hardcodedProducts[productId]) {
            return hardcodedProducts[productId];
        }
        
        return null;
    } catch (error) {
        console.error('Error getting product:', error);
        // Fallback to hardcoded
        if (hardcodedProducts[productId]) {
            return hardcodedProducts[productId];
        }
        return null;
    }
}

// สร้าง Order
async function createOrder(userId, product, quantity = 1, deliveryData = {}) {
    try {
        const total = parseFloat(product.price) * quantity;
        const order = {
            order_id: `ORD${Date.now()}`,
            user_id: userId,
            product_id: product.product_id,
            product_name: product.name,
            quantity: quantity,
            price: product.price,
            total: total,
            status: 'completed',
            delivery_data: deliveryData
        };

        const { data, error } = await supabaseAdmin
            .from('orders')
            .insert(order)
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error creating order:', error);
        return null;
    }
}

// ดึง Stock ที่ยังไม่ขาย (สำหรับ Auto Delivery)
async function getAvailableStock(productId, quantity = 1) {
    try {
        const { data, error } = await supabaseAdmin
            .from('product_stocks')
            .select('*')
            .eq('product_id', productId)
            .eq('is_sold', false)
            .limit(quantity);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting stock:', error);
        return [];
    }
}

// Mark stock as sold
async function markStockAsSold(stockIds, userId, orderId) {
    try {
        const { error } = await supabaseAdmin
            .from('product_stocks')
            .update({
                is_sold: true,
                sold_to: userId,
                sold_at: new Date().toISOString(),
                order_id: orderId
            })
            .in('id', stockIds);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error marking stock as sold:', error);
        return false;
    }
}

// นับ Stock ที่ยังไม่ขาย
async function countAvailableStock(productId) {
    try {
        const { count, error } = await supabaseAdmin
            .from('product_stocks')
            .select('*', { count: 'exact', head: true })
            .eq('product_id', productId)
            .eq('is_sold', false);

        if (error) throw error;
        return count || 0;
    } catch (error) {
        console.error('Error counting stock:', error);
        return 0;
    }
}

// =============================================
// Middleware Configuration
// =============================================

// Helmet - Security Headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"], // อนุญาต inline event handlers (onclick, onchange, etc.)
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https://*.supabase.co", "https://discord.com"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors(corsOptions));

// IP Blocker
app.use(ipBlocker);

// Request Logger (Development only)
if (isDevelopment) {
    app.use(requestLogger);
}

// Detect Suspicious Activity
app.use(detectSuspiciousActivity);

// Prevent Parameter Pollution
app.use(preventParameterPollution);

// Body Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static Files
app.use(express.static(__dirname));

// ตรวจสอบ Session Secret (บังคับต้องตั้งใน Production)
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    if (!isDevelopment) {
        console.error('❌ FATAL: SESSION_SECRET must be set and at least 32 characters in production!');
        process.exit(1);
    } else {
        console.warn('⚠️  Warning: SESSION_SECRET not properly set. Using insecure default for development only.');
    }
}

// ตรวจสอบว่าใช้ HTTPS หรือไม่ (สำหรับ secure cookie)
// localhost ไม่ต้องใช้ secure cookie แม้จะเป็น production mode
const isLocalhost = (process.env.DISCORD_REDIRECT_URI || '').includes('localhost');
const useSecureCookie = !isDevelopment && !isLocalhost;

// Session configuration
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-in-production-32chars',
    resave: false,
    saveUninitialized: false,
    name: 'dips.sid', // ไม่ใช้ชื่อ default เพื่อความปลอดภัย
    cookie: {
        secure: useSecureCookie, // true เมื่อ production + HTTPS (ไม่ใช่ localhost)
        httpOnly: true, // ป้องกัน XSS
        sameSite: 'lax', // ป้องกัน CSRF
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 วัน
    }
};

// ใช้ SupabaseStore ใน production (Cloud Run, etc.)
if (process.env.NODE_ENV === 'production') {
    sessionConfig.store = new SupabaseStore({
        tableName: 'sessions',
        ttl: 7 * 24 * 60 * 60 // 7 days in seconds
    });
    console.log('✅ Using Supabase Session Store (production)');
} else {
    console.log('⚠️ Using MemoryStore (development only)');
}

app.use(session(sessionConfig));

// Discord OAuth2 Configuration
const DISCORD_API = 'https://discord.com/api/v10';
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;

// =============================================
// Discord OAuth2 Routes
// =============================================

// Route: Redirect to Discord login
app.get('/auth/discord', loginLimiter, (req, res) => {
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: 'identify email guilds'
    });
    
    res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

// Route: Discord callback
app.get('/auth/discord/callback', async (req, res) => {
    const { code, error } = req.query;
    
    if (error) {
        return res.redirect('/pages/login.html?error=access_denied');
    }
    
    if (!code) {
        return res.redirect('/pages/login.html?error=no_code');
    }
    
    try {
        // แลก code เป็น access token
        const tokenResponse = await axios.post(
            `${DISCORD_API}/oauth2/token`,
            new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        const { access_token, refresh_token, expires_in } = tokenResponse.data;
        
        // ดึงข้อมูล user จาก Discord
        const userResponse = await axios.get(`${DISCORD_API}/users/@me`, {
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        });
        
        const discordUser = userResponse.data;
        
        // บันทึก user ลง Supabase
        await upsertUser(discordUser);
        
        // สร้าง wallet ถ้ายังไม่มี
        await getOrCreateWallet(discordUser.id);
        
        // เก็บข้อมูลใน session
        req.session.user = {
            id: discordUser.id,
            username: discordUser.username,
            discriminator: discordUser.discriminator,
            email: discordUser.email,
            avatar: discordUser.avatar 
                ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
                : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator) % 5}.png`,
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresAt: Date.now() + (expires_in * 1000)
        };
        
        // Redirect กลับไปหน้าหลัก
        res.redirect('/?login=success');
        
    } catch (error) {
        console.error('Discord OAuth Error:', error.response?.data || error.message);
        res.redirect('/pages/login.html?error=oauth_failed');
    }
});

// Route: Get current user
app.get('/api/user', (req, res) => {
    if (req.session.user) {
        // ส่งข้อมูล user (ไม่ส่ง token กลับไป frontend)
        const { accessToken, refreshToken, expiresAt, ...safeUser } = req.session.user;
        res.json({
            loggedIn: true,
            user: safeUser
        });
    } else {
        res.json({
            loggedIn: false,
            user: null
        });
    }
});

// Route: Logout
app.get('/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/');
    });
});

// Route: API Logout (for AJAX)
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true });
    });
});

// =============================================
// Protected Routes Example
// =============================================

// Middleware: Check if logged in
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Example protected route
app.get('/api/profile', requireAuth, (req, res) => {
    res.json({
        user: req.session.user,
        message: 'This is protected data!'
    });
});

// =============================================
// Wallet API Routes
// =============================================

// ดึงข้อมูล Wallet
app.get('/api/wallet', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const balance = await getUserBalance(userId);
        const transactions = await getUserTransactions(userId, 5);
        
        res.json({
            success: true,
            balance: balance,
            transactions: transactions
        });
    } catch (error) {
        console.error('Wallet error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// สร้างคำขอเติมเงิน (ต้อง Admin approve)
app.post('/api/wallet/topup', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { amount, method, slipUrl } = req.body;
        
        // Validate
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ success: false, error: 'จำนวนเงินไม่ถูกต้อง' });
        }
        
        if (amount > 100000) {
            return res.status(400).json({ success: false, error: 'เติมได้ไม่เกิน 100,000 บาทต่อครั้ง' });
        }

        if (!method || !['promptpay', 'truemoney', 'bank_transfer'].includes(method)) {
            return res.status(400).json({ success: false, error: 'กรุณาเลือกวิธีการชำระเงิน' });
        }

        // ตรวจสอบว่ามี pending request อยู่หรือไม่
        const { data: pendingRequests } = await supabaseAdmin
            .from('topup_requests')
            .select('id')
            .eq('user_id', userId)
            .eq('status', 'pending');

        if (pendingRequests && pendingRequests.length >= 3) {
            return res.status(400).json({ 
                success: false, 
                error: 'คุณมีคำขอเติมเงินที่รอดำเนินการอยู่ 3 รายการแล้ว กรุณารอการอนุมัติ' 
            });
        }
        
        // สร้าง Topup Request (รอ Admin approve)
        const requestId = `REQ${Date.now()}`;
        const { data: request, error } = await supabaseAdmin
            .from('topup_requests')
            .insert({
                request_id: requestId,
                user_id: userId,
                amount: parseFloat(amount),
                method: method,
                slip_url: slipUrl || null,
                status: 'pending'
            })
            .select()
            .single();

        if (error) throw error;
        
        res.json({
            success: true,
            message: 'สร้างคำขอเติมเงินสำเร็จ รอการอนุมัติจาก Admin',
            request: {
                id: request.request_id,
                amount: parseFloat(request.amount),
                method: request.method,
                status: request.status,
                createdAt: request.created_at
            }
        });
    } catch (error) {
        console.error('Topup request error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// ดึงคำขอเติมเงินของ user
app.get('/api/wallet/topup/requests', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { data: requests, error } = await supabaseAdmin
            .from('topup_requests')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        res.json({
            success: true,
            requests: (requests || []).map(r => ({
                id: r.request_id,
                amount: parseFloat(r.amount),
                method: r.method,
                slipUrl: r.slip_url,
                status: r.status,
                adminNote: r.admin_note,
                createdAt: r.created_at,
                reviewedAt: r.reviewed_at
            }))
        });
    } catch (error) {
        console.error('Get topup requests error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// ยกเลิกคำขอเติมเงิน (เฉพาะ pending)
app.post('/api/wallet/topup/:requestId/cancel', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { requestId } = req.params;

        // ตรวจสอบว่าเป็น request ของ user นี้และยัง pending อยู่
        const { data: request, error: checkError } = await supabaseAdmin
            .from('topup_requests')
            .select('*')
            .eq('request_id', requestId)
            .eq('user_id', userId)
            .eq('status', 'pending')
            .single();

        if (checkError || !request) {
            return res.status(404).json({ success: false, error: 'ไม่พบคำขอหรือไม่สามารถยกเลิกได้' });
        }

        // อัพเดทสถานะเป็น cancelled
        const { error } = await supabaseAdmin
            .from('topup_requests')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('request_id', requestId);

        if (error) throw error;

        res.json({ success: true, message: 'ยกเลิกคำขอเติมเงินสำเร็จ' });
    } catch (error) {
        console.error('Cancel topup error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// =============================================
// Thunder Solution API - QR PromptPay & Slip Verify
// =============================================

const thunderApi = require('./utils/thunderApi');

// ดึง config Thunder API
app.get('/api/thunder/config', (req, res) => {
    const config = thunderApi.getConfig();
    res.json({
        success: true,
        ...config
    });
});

// สร้าง QR Code PromptPay
app.post('/api/thunder/generate-qr', requireAuth, async (req, res) => {
    try {
        if (!thunderApi.isEnabled()) {
            return res.status(400).json({
                success: false,
                error: 'ระบบเติมเงินผ่าน QR ยังไม่เปิดใช้งาน'
            });
        }

        const userId = req.session.user.id;
        const { amount } = req.body;

        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'จำนวนเงินไม่ถูกต้อง'
            });
        }

        const ref = `DIPS-${userId.slice(0,8)}-${Date.now()}`;
        const result = await thunderApi.generateQR(parseFloat(amount), null, ref);

        if (result.success) {
            res.json({
                success: true,
                qrCode: result.qrCode,
                qrImage: result.qrImage,
                amount: result.amount,
                ref: result.ref,
                expiresAt: result.expiresAt
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error || 'ไม่สามารถสร้าง QR Code ได้'
            });
        }
    } catch (error) {
        console.error('Generate QR error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// ตรวจสอบ Slip
app.post('/api/thunder/verify-slip', requireAuth, async (req, res) => {
    try {
        if (!thunderApi.isEnabled()) {
            return res.status(400).json({
                success: false,
                error: 'ระบบตรวจสอบ Slip ยังไม่เปิดใช้งาน'
            });
        }

        const userId = req.session.user.id;
        const { slipData, amount, requestId } = req.body;

        if (!slipData) {
            return res.status(400).json({
                success: false,
                error: 'กรุณาอัพโหลดรูป Slip'
            });
        }

        const result = await thunderApi.verifySlip(slipData);

        if (result.success) {
            // ตรวจสอบจำนวนเงินตรงกันหรือไม่
            if (amount && Math.abs(result.amount - parseFloat(amount)) > 0.01) {
                return res.json({
                    success: false,
                    error: `จำนวนเงินไม่ตรงกัน (Slip: ${result.amount} บาท, คำขอ: ${amount} บาท)`,
                    slipAmount: result.amount,
                    requestedAmount: amount
                });
            }

            // ถ้ามี requestId ให้อัพเดต topup request
            if (requestId) {
                await supabase
                    .from('topup_requests')
                    .update({
                        status: 'verified',
                        slip_ref: result.transRef,
                        verified_amount: result.amount,
                        verified_at: new Date().toISOString()
                    })
                    .eq('request_id', requestId)
                    .eq('user_id', userId);
            }

            res.json({
                success: true,
                amount: result.amount,
                transRef: result.transRef,
                senderName: result.senderName,
                receiverName: result.receiverName,
                sendingBank: result.sendingBank,
                receivingBank: result.receivingBank,
                date: result.date
            });
        } else {
            res.json({
                success: false,
                error: result.error || 'ไม่สามารถตรวจสอบ Slip ได้'
            });
        }
    } catch (error) {
        console.error('Verify slip error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// เช็คยอด Credit Thunder API (Admin only - defined later)
// Note: This endpoint is defined after requireAdmin middleware

// =============================================
// TrueMoney Angpao Auto-Topup
// =============================================

// เช็คสถานะการตั้งค่า TrueMoney
app.get('/api/truemoney/status', (req, res) => {
    const config = getConfigStatus();
    // เช็คว่าเป็น manual mode หรือ auto
    const isManualMode = !config.hasApiKey || !config.hasPhone;
    res.json({
        success: true,
        enabled: config.enabled,
        manualMode: isManualMode,
        minAmount: config.minAmount,
        maxAmount: config.maxAmount
    });
});

// Redeem ซองอั่งเปา TrueMoney
app.post('/api/truemoney/redeem', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { voucherLink } = req.body;
        
        // Validate input
        if (!voucherLink || typeof voucherLink !== 'string') {
            return res.status(400).json({ 
                success: false, 
                error: 'กรุณากรอกลิ้งซองอั่งเปา' 
            });
        }
        
        // ตรวจสอบ format ก่อน
        const validation = validateVoucherFormat(voucherLink);
        if (!validation.valid) {
            return res.status(400).json({ 
                success: false, 
                error: 'รูปแบบลิ้งซองอั่งเปาไม่ถูกต้อง' 
            });
        }
        
        if (validation.alreadyUsed) {
            return res.status(400).json({ 
                success: false, 
                error: 'ซองอั่งเปานี้ถูกใช้ไปแล้ว' 
            });
        }
        
        // เรียก API redeem
        const result = await redeemAngpao(voucherLink);
        
        if (!result.success) {
            // Log failed attempt
            await logSecurityEvent({
                eventType: 'angpao_failed',
                userId: userId,
                details: {
                    voucherHash: validation.voucherHash,
                    error: result.message
                },
                ipAddress: req.ip
            });
            
            return res.status(400).json({ 
                success: false, 
                error: result.message 
            });
        }
        
        // Redeem สำเร็จ - เติมเงินเข้า wallet
        const amount = result.amount;
        
        // เพิ่มยอดเงิน
        await updateBalance(userId, amount);
        
        // บันทึก transaction
        await addTransaction(userId, 'topup', amount, {
            method: 'truemoney_angpao',
            transactionId: result.transactionId,
            voucherHash: validation.voucherHash
        });
        
        // Invalidate cache
        invalidateBalanceCache(userId);
        
        // Log สำเร็จ
        await logAudit({
            userId: userId,
            action: AuditActions.TOPUP,
            resourceType: ResourceTypes.WALLET,
            resourceId: userId,
            details: {
                amount: amount,
                method: 'truemoney_angpao',
                transactionId: result.transactionId
            },
            ipAddress: req.ip
        });
        
        // ดึง balance ใหม่
        const newBalance = await getUserBalance(userId);
        
        res.json({
            success: true,
            message: `เติมเงินสำเร็จ ${amount} บาท`,
            amount: amount,
            transactionId: result.transactionId,
            balance: newBalance
        });
        
    } catch (error) {
        console.error('TrueMoney redeem error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'เกิดข้อผิดพลาดในการเติมเงิน' 
        });
    }
});

// =============================================
// Manual Angpao Request (ส่งลิ้งซอง -> Admin รับเอง -> Approve)
// =============================================

// ส่งคำขอ Angpao (รอ Admin approve)
app.post('/api/angpao/submit', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const username = req.session.user.username;
        const { voucherLink, expectedAmount } = req.body;
        
        // Validate input
        if (!voucherLink || typeof voucherLink !== 'string') {
            return res.status(400).json({ 
                success: false, 
                error: 'กรุณากรอกลิ้งซองอั่งเปา' 
            });
        }
        
        // ตรวจสอบ format
        const validation = validateVoucherFormat(voucherLink);
        if (!validation.valid) {
            return res.status(400).json({ 
                success: false, 
                error: 'รูปแบบลิ้งซองอั่งเปาไม่ถูกต้อง' 
            });
        }
        
        // ตรวจสอบว่ามี pending request อยู่หรือไม่
        const { data: pendingRequests } = await supabaseAdmin
            .from('topup_requests')
            .select('id')
            .eq('user_id', userId)
            .eq('status', 'pending')
            .like('slip_url', '%gift.truemoney.com%');

        if (pendingRequests && pendingRequests.length >= 3) {
            return res.status(400).json({ 
                success: false, 
                error: 'คุณมีคำขอซองอั่งเปาที่รอดำเนินการ 3 รายการแล้ว' 
            });
        }
        
        // สร้าง Request ID
        const requestId = `ANG${Date.now()}`;
        
        // บันทึกลง database
        const { data: request, error } = await supabaseAdmin
            .from('topup_requests')
            .insert({
                request_id: requestId,
                user_id: userId,
                amount: expectedAmount ? parseFloat(expectedAmount) : 0,
                method: 'truemoney',
                slip_url: voucherLink, // เก็บลิ้งซองใน slip_url field
                status: 'pending'
            })
            .select()
            .single();

        if (error) throw error;
        
        // ส่ง Discord notification
        await notifyAngpaoRequest({
            requestId: requestId,
            userId: userId,
            username: username,
            voucherLink: voucherLink,
            expectedAmount: expectedAmount
        });
        
        res.json({
            success: true,
            message: 'ส่งคำขอเติมเงินสำเร็จ กรุณารอ Admin ดำเนินการ',
            request: {
                id: requestId,
                voucherLink: voucherLink,
                expectedAmount: expectedAmount || 0,
                status: 'pending'
            }
        });
        
    } catch (error) {
        console.error('Angpao submit error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'เกิดข้อผิดพลาด' 
        });
    }
});

// ดึงคำขอ Angpao ของ user
app.get('/api/angpao/requests', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        const { data: requests, error } = await supabaseAdmin
            .from('topup_requests')
            .select('*')
            .eq('user_id', userId)
            .like('slip_url', '%gift.truemoney.com%')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        res.json({
            success: true,
            requests: requests.map(r => ({
                id: r.request_id,
                voucherLink: r.slip_url,
                expectedAmount: r.amount,
                actualAmount: r.actual_amount,
                status: r.status,
                adminNote: r.admin_note,
                createdAt: r.created_at,
                reviewedAt: r.reviewed_at
            }))
        });
    } catch (error) {
        console.error('Get angpao requests error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// ยกเลิกคำขอ Angpao
app.post('/api/angpao/:requestId/cancel', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { requestId } = req.params;

        const { data: request, error: checkError } = await supabaseAdmin
            .from('topup_requests')
            .select('*')
            .eq('request_id', requestId)
            .eq('user_id', userId)
            .eq('status', 'pending')
            .single();

        if (checkError || !request) {
            return res.status(404).json({ success: false, error: 'ไม่พบคำขอหรือไม่สามารถยกเลิกได้' });
        }

        const { error } = await supabaseAdmin
            .from('topup_requests')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('request_id', requestId);

        if (error) throw error;

        res.json({ success: true, message: 'ยกเลิกคำขอสำเร็จ' });
    } catch (error) {
        console.error('Cancel angpao error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// หักเงิน (ซื้อสินค้า)
app.post('/api/wallet/deduct', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { amount, productId, productName } = req.body;
        
        // Validate
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ success: false, error: 'จำนวนเงินไม่ถูกต้อง' });
        }
        
        const currentBalance = await getUserBalance(userId);
        
        if (currentBalance < amount) {
            return res.status(400).json({ 
                success: false, 
                error: 'ยอดเงินไม่เพียงพอ',
                currentBalance: currentBalance,
                required: amount
            });
        }
        
        // หักเงิน
        const newBalance = currentBalance - parseFloat(amount);
        await updateUserBalance(userId, newBalance);
        
        // บันทึก Transaction
        const transaction = await addTransaction(userId, 'purchase', -parseFloat(amount), {
            productId: productId,
            productName: productName
        });
        
        res.json({
            success: true,
            newBalance: newBalance,
            transaction: transaction
        });
    } catch (error) {
        console.error('Deduct error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// ดึงประวัติธุรกรรม
app.get('/api/wallet/transactions', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const limit = parseInt(req.query.limit) || 10;
        const transactions = await getUserTransactions(userId, Math.min(limit, 50));
        
        res.json({
            success: true,
            transactions: transactions
        });
    } catch (error) {
        console.error('Transactions error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// =============================================
// Products API Routes
// =============================================

// ดึงสินค้าทั้งหมด (พร้อม Caching)
app.get('/api/products', async (req, res) => {
    try {
        const category = req.query.category;
        
        // ใช้ cache เพื่อเพิ่มประสิทธิภาพ
        const products = await getCachedProducts(category, async () => {
            return await getProducts(category);
        });
        
        res.json({ success: true, products });
    } catch (error) {
        console.error('Products error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// ดึงสินค้าตาม ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await getProductById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, error: 'ไม่พบสินค้า' });
        }
        res.json({ success: true, product });
    } catch (error) {
        console.error('Product error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// ซื้อสินค้า (Auto Delivery) - ใช้ Transaction เพื่อป้องกัน Race Condition
app.post('/api/products/:id/purchase', 
    requireAuth, 
    purchaseLimiter, 
    purchaseValidation, 
    validate, 
    async (req, res) => {
    try {
        const userId = req.session.user.id;
        const productId = req.params.id;
        const quantity = parseInt(req.body.quantity) || 1;

        // Validate quantity range
        if (quantity < 1 || quantity > 100) {
            return res.status(400).json({ 
                success: false, 
                error: 'จำนวนสินค้าต้องอยู่ระหว่าง 1-100' 
            });
        }

        // ดึงข้อมูลสินค้า
        const product = await getProductById(productId);
        if (!product) {
            return res.status(404).json({ success: false, error: 'ไม่พบสินค้า' });
        }

        // ตรวจสอบว่าสินค้า active หรือไม่
        if (!product.is_active) {
            return res.status(400).json({ 
                success: false, 
                error: 'สินค้านี้ไม่พร้อมขาย' 
            });
        }

        const pricePerUnit = parseFloat(product.price);

        // Validate price
        if (isNaN(pricePerUnit) || pricePerUnit < 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'ราคาสินค้าไม่ถูกต้อง' 
            });
        }

        // ใช้ Stored Procedure เพื่อทำ Transaction อย่างปลอดภัย
        // ป้องกัน Race Condition และรับประกันความ Consistent ของข้อมูล
        const { data: result, error: rpcError } = await supabaseAdmin.rpc('complete_purchase', {
            p_user_id: userId,
            p_product_id: productId,
            p_quantity: quantity,
            p_price_per_unit: pricePerUnit,
            p_product_name: product.name
        });

        if (rpcError) {
            // Handle specific errors from stored procedure
            const errorMsg = rpcError.message || '';
            
            if (errorMsg.includes('INSUFFICIENT_STOCK')) {
                const match = errorMsg.match(/Available (\d+), Requested (\d+)/);
                return res.status(400).json({ 
                    success: false, 
                    error: 'สินค้าหมด',
                    available: match ? parseInt(match[1]) : 0,
                    requested: quantity
                });
            }
            
            if (errorMsg.includes('INSUFFICIENT_BALANCE')) {
                const match = errorMsg.match(/Balance ([\d.]+), Required ([\d.]+)/);
                return res.status(400).json({ 
                    success: false, 
                    error: 'ยอดเงินไม่เพียงพอ',
                    balance: match ? parseFloat(match[1]) : 0,
                    required: match ? parseFloat(match[2]) : 0
                });
            }
            
            if (errorMsg.includes('WALLET_NOT_FOUND')) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'ไม่พบ Wallet กรุณาเข้าสู่ระบบใหม่'
                });
            }
            
            throw rpcError;
        }

        // Parse result จาก stored procedure
        const purchaseResult = typeof result === 'string' ? JSON.parse(result) : result;

        // Invalidate caches หลังซื้อสำเร็จ
        invalidateProductsCache(productId);
        invalidateBalanceCache(userId);
        invalidateStockCache(productId);

        res.json({
            success: true,
            message: 'ซื้อสินค้าสำเร็จ!',
            order: {
                order_id: purchaseResult.orderId,
                product_id: productId,
                product_name: product.name,
                quantity: quantity,
                total: purchaseResult.total
            },
            delivery: purchaseResult.deliveryItems, // ส่ง Key/Code กลับไปให้ลูกค้า
            newBalance: purchaseResult.newBalance
        });
    } catch (error) {
        console.error('Purchase error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการซื้อสินค้า กรุณาลองใหม่' });
    }
});

// ดึง Orders ของ user (My Purchases)
app.get('/api/orders', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { data: orders, error } = await supabaseAdmin
            .from('orders')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ success: true, orders: orders || [] });
    } catch (error) {
        console.error('Orders error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// ดึง Order เดียว (พร้อม delivery data)
app.get('/api/orders/:id', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { data: order, error } = await supabaseAdmin
            .from('orders')
            .select('*')
            .eq('order_id', req.params.id)
            .eq('user_id', userId)
            .single();

        if (error || !order) {
            return res.status(404).json({ success: false, error: 'ไม่พบคำสั่งซื้อ' });
        }

        res.json({ success: true, order });
    } catch (error) {
        console.error('Order error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// =============================================
// Admin API Routes
// =============================================

// Admin IDs (Discord IDs ที่มีสิทธิ์เข้าถึง Admin Panel)
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim()).filter(Boolean);

// Middleware: Check if admin
const requireAdmin = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!ADMIN_IDS.includes(req.session.user.id)) {
        return res.status(403).json({ error: 'Forbidden - Admin only' });
    }
    next();
};

// Check admin access
app.get('/api/admin/check', (req, res) => {
    if (!req.session.user) {
        return res.json({ isAdmin: false });
    }
    const isAdmin = ADMIN_IDS.includes(req.session.user.id);
    res.json({ 
        isAdmin, 
        user: isAdmin ? req.session.user : null 
    });
});

// Test Discord webhook
app.get('/api/admin/test-webhook', requireAdmin, async (req, res) => {
    const result = await testWebhook();
    res.json(result);
});

// เช็คยอด Credit Thunder API (Admin only)
app.get('/api/thunder/balance', requireAdmin, async (req, res) => {
    try {
        const thunderApi = require('./utils/thunderApi');
        const result = await thunderApi.checkBalance();
        res.json(result);
    } catch (error) {
        console.error('Check Thunder balance error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// Get admin stats
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
        // Count users
        const { count: usersCount } = await supabaseAdmin
            .from('users')
            .select('*', { count: 'exact', head: true });

        // Total balance
        const { data: wallets } = await supabaseAdmin
            .from('wallets')
            .select('balance');
        const totalBalance = wallets?.reduce((sum, w) => sum + parseFloat(w.balance || 0), 0) || 0;

        // Count products
        const { count: productsCount } = await supabaseAdmin
            .from('products')
            .select('*', { count: 'exact', head: true });

        // Count orders
        const { count: ordersCount } = await supabaseAdmin
            .from('orders')
            .select('*', { count: 'exact', head: true });

        res.json({
            users: usersCount || 0,
            totalBalance: totalBalance,
            products: productsCount || 0,
            orders: ordersCount || 0
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
});

// Get all users (admin)
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const { data: users } = await supabaseAdmin
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        // Get balances
        const { data: wallets } = await supabaseAdmin
            .from('wallets')
            .select('user_id, balance');

        const walletMap = {};
        wallets?.forEach(w => { walletMap[w.user_id] = parseFloat(w.balance) || 0; });

        const usersWithBalance = users?.map(u => ({
            ...u,
            balance: walletMap[u.discord_id] || 0
        }));

        res.json({ success: true, users: usersWithBalance || [] });
    } catch (error) {
        console.error('Users error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// Get all products (admin) - เพิ่ม rate limiting
app.get('/api/admin/products', requireAdmin, adminLimiter, async (req, res) => {
    try {
        const { data: products } = await supabaseAdmin
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });

        res.json({ success: true, products: products || [] });
    } catch (error) {
        console.error('Products error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// Add product (admin) - เพิ่ม validation และ rate limiting
app.post('/api/admin/products', 
    requireAdmin, 
    adminLimiter, 
    createProductValidation, 
    validate, 
    async (req, res) => {
    try {
        const { product_id, name, description, category, price, original_price, stock, image } = req.body;

        // ตรวจสอบว่า product_id ซ้ำหรือไม่
        const existing = await getProductById(product_id);
        if (existing) {
            return res.status(400).json({ 
                success: false, 
                error: 'รหัสสินค้านี้ถูกใช้แล้ว' 
            });
        }

        const { data, error } = await supabaseAdmin
            .from('products')
            .insert({
                product_id,
                name: name.trim(),
                description: description?.trim() || '',
                category: category.trim(),
                price: parseFloat(price),
                original_price: original_price ? parseFloat(original_price) : null,
                image: image?.trim() || null,
                stock: stock || 0,
                is_active: true
            })
            .select()
            .single();

        if (error) throw error;

        // Invalidate cache หลังเพิ่มสินค้า
        invalidateProductsCache();

        // Audit log
        logAudit({
            userId: req.session.user.id,
            username: req.session.user.username,
            action: AuditActions.CREATE,
            resourceType: ResourceTypes.PRODUCT,
            resourceId: product_id,
            newValue: { name, category, price },
            req
        });

        res.json({ success: true, product: data });
    } catch (error) {
        console.error('Add product error:', error);
        const errorMsg = isDevelopment ? error.message : 'เกิดข้อผิดพลาด';
        res.status(500).json({ success: false, error: errorMsg });
    }
});

// Update product (admin)
app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
    try {
        const { name, description, category, price, original_price, stock, is_active, image } = req.body;

        const { data, error } = await supabaseAdmin
            .from('products')
            .update({ 
                name, 
                description, 
                category, 
                price, 
                original_price, 
                stock, 
                is_active,
                image: image?.trim() || null
            })
            .eq('product_id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        // Invalidate cache หลังแก้ไขสินค้า
        invalidateProductsCache(req.params.id);

        res.json({ success: true, product: data });
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// Delete product (admin)
app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
    try {
        const productId = req.params.id;
        
        // Get product data before delete for audit
        const existingProduct = await getProductById(productId);
        
        const { error } = await supabaseAdmin
            .from('products')
            .delete()
            .eq('product_id', productId);

        if (error) throw error;

        // Invalidate cache หลังลบสินค้า
        invalidateProductsCache(productId);

        // Audit log
        logAudit({
            userId: req.session.user.id,
            username: req.session.user.username,
            action: AuditActions.DELETE,
            resourceType: ResourceTypes.PRODUCT,
            resourceId: productId,
            oldValue: existingProduct ? { name: existingProduct.name, price: existingProduct.price } : null,
            req
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// Get all orders (admin)
app.get('/api/admin/orders', requireAdmin, async (req, res) => {
    try {
        const { data: orders } = await supabaseAdmin
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });

        res.json({ success: true, orders: orders || [] });
    } catch (error) {
        console.error('Orders error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// Get all transactions (admin)
app.get('/api/admin/transactions', requireAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        
        const { data: transactions } = await supabaseAdmin
            .from('transactions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        res.json({ success: true, transactions: transactions || [] });
    } catch (error) {
        console.error('Transactions error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// Admin topup (เติมเงินให้ user โดยตรง)
app.post('/api/admin/topup', requireAdmin, async (req, res) => {
    try {
        const { userId, amount, note } = req.body;

        if (!userId || !amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'ข้อมูลไม่ถูกต้อง' });
        }

        // Get or create wallet
        await getOrCreateWallet(userId);

        // Update balance
        const currentBalance = await getUserBalance(userId);
        const newBalance = currentBalance + parseFloat(amount);
        await updateUserBalance(userId, newBalance);

        // Add transaction
        await addTransaction(userId, 'topup', parseFloat(amount), {
            method: 'admin',
            note: note || 'Admin topup',
            adminId: req.session.user.id
        });

        // Audit log
        logAudit({
            userId: req.session.user.id,
            username: req.session.user.username,
            action: AuditActions.TOPUP,
            resourceType: ResourceTypes.WALLET,
            resourceId: userId,
            newValue: { amount: parseFloat(amount), note, targetUser: userId },
            req
        });

        res.json({ success: true, newBalance });
    } catch (error) {
        console.error('Admin topup error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// =============================================
// Admin Topup Requests Management
// =============================================

// ดึง Topup Requests ทั้งหมด
app.get('/api/admin/topup-requests', requireAdmin, async (req, res) => {
    try {
        const status = req.query.status; // pending, approved, rejected, all
        const method = req.query.method; // angpao, promptpay, truemoney, bank_transfer
        
        let query = supabaseAdmin
            .from('topup_requests')
            .select('*')
            .order('created_at', { ascending: false });

        if (status && status !== 'all') {
            query = query.eq('status', status);
        }
        
        if (method) {
            query = query.eq('method', method);
        }

        const { data: requests, error } = await query.limit(100);

        if (error) throw error;

        // ดึงข้อมูล user มาด้วย
        const userIds = [...new Set(requests?.map(r => r.user_id) || [])];
        const { data: users } = await supabaseAdmin
            .from('users')
            .select('discord_id, username, avatar')
            .in('discord_id', userIds);

        const userMap = {};
        users?.forEach(u => { userMap[u.discord_id] = u; });

        const requestsWithUser = (requests || []).map(r => ({
            id: r.request_id,
            userId: r.user_id,
            user: userMap[r.user_id] || null,
            amount: parseFloat(r.amount),
            method: r.method,
            slipUrl: r.slip_url,
            status: r.status,
            adminNote: r.admin_note,
            reviewedBy: r.reviewed_by,
            reviewedAt: r.reviewed_at,
            createdAt: r.created_at
        }));

        res.json({ success: true, requests: requestsWithUser });
    } catch (error) {
        console.error('Get topup requests error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// Approve Topup Request
app.post('/api/admin/topup-requests/:requestId/approve', requireAdmin, async (req, res) => {
    try {
        const { requestId } = req.params;
        const adminId = req.session.user.id;
        const { note, amount: bodyAmount } = req.body;

        // ดึงข้อมูล request
        const { data: request, error: fetchError } = await supabaseAdmin
            .from('topup_requests')
            .select('*')
            .eq('request_id', requestId)
            .eq('status', 'pending')
            .single();

        if (fetchError || !request) {
            return res.status(404).json({ success: false, error: 'ไม่พบคำขอหรือถูกดำเนินการแล้ว' });
        }

        const userId = request.user_id;
        // สำหรับ angpao ใช้ amount จาก body, อื่นๆ ใช้จาก request
        const amount = bodyAmount ? parseFloat(bodyAmount) : parseFloat(request.amount);
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'กรุณาระบุจำนวนเงิน' });
        }

        // อัพเดทสถานะ request เป็น approved
        const { error: updateError } = await supabaseAdmin
            .from('topup_requests')
            .update({
                status: 'approved',
                amount: amount, // อัพเดท amount ด้วย (สำหรับ angpao)
                admin_note: note || 'อนุมัติแล้ว',
                reviewed_by: adminId,
                reviewed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('request_id', requestId);

        if (updateError) throw updateError;

        // เติมเงินให้ user
        await getOrCreateWallet(userId);
        const currentBalance = await getUserBalance(userId);
        const newBalance = currentBalance + amount;
        await updateUserBalance(userId, newBalance);

        // บันทึก Transaction
        await addTransaction(userId, 'topup', amount, {
            method: request.method,
            requestId: requestId,
            approvedBy: adminId,
            note: note || 'อนุมัติโดย Admin'
        });
        
        // Invalidate balance cache
        invalidateBalanceCache(userId);
        
        // Send Discord notification (if angpao)
        const isAngpao = request.slip_url?.includes('gift.truemoney.com');
        if (isAngpao) {
            await notifyAngpaoResult({
                requestId: requestId,
                userId: userId
            }, 'approved', amount);
        }

        res.json({ 
            success: true, 
            message: `อนุมัติเติมเงิน ${amount} บาท ให้ ${userId} สำเร็จ`,
            newBalance: newBalance
        });
    } catch (error) {
        console.error('Approve topup error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// Reject Topup Request
app.post('/api/admin/topup-requests/:requestId/reject', requireAdmin, async (req, res) => {
    try {
        const { requestId } = req.params;
        const adminId = req.session.user.id;
        const { note, reason } = req.body;
        
        const rejectReason = note || reason || 'ปฏิเสธโดย Admin';

        // ดึงข้อมูล request
        const { data: request, error: fetchError } = await supabaseAdmin
            .from('topup_requests')
            .select('*')
            .eq('request_id', requestId)
            .eq('status', 'pending')
            .single();

        if (fetchError || !request) {
            return res.status(404).json({ success: false, error: 'ไม่พบคำขอหรือถูกดำเนินการแล้ว' });
        }

        // อัพเดทสถานะ request เป็น rejected
        const { error: updateError } = await supabaseAdmin
            .from('topup_requests')
            .update({
                status: 'rejected',
                admin_note: rejectReason,
                reviewed_by: adminId,
                reviewed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('request_id', requestId);

        if (updateError) throw updateError;
        
        // Send Discord notification (if angpao)
        const isAngpaoReject = request.slip_url?.includes('gift.truemoney.com');
        if (isAngpaoReject) {
            await notifyAngpaoResult({
                requestId: requestId,
                userId: request.user_id,
                adminNote: rejectReason
            }, 'rejected');
        }

        res.json({ 
            success: true, 
            message: 'ปฏิเสธคำขอเติมเงินแล้ว'
        });
    } catch (error) {
        console.error('Reject topup error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// =============================================
// Admin Stock Management (Auto Delivery)
// =============================================

// ดึง stock ทั้งหมดของ product
app.get('/api/admin/products/:id/stocks', requireAdmin, async (req, res) => {
    try {
        const productId = req.params.id;
        const showSold = req.query.showSold === 'true';
        
        let query = supabaseAdmin
            .from('product_stocks')
            .select('*')
            .eq('product_id', productId)
            .order('created_at', { ascending: false });

        if (!showSold) {
            query = query.eq('is_sold', false);
        }

        const { data: stocks, error } = await query;

        if (error) throw error;

        // นับจำนวน available
        const available = stocks?.filter(s => !s.is_sold).length || 0;
        const sold = stocks?.filter(s => s.is_sold).length || 0;

        res.json({ 
            success: true, 
            stocks: stocks || [],
            summary: { available, sold, total: (available + sold) }
        });
    } catch (error) {
        console.error('Get stocks error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// เพิ่ม stock (Key/Code) ให้สินค้า
app.post('/api/admin/products/:id/stocks', requireAdmin, async (req, res) => {
    try {
        const productId = req.params.id;
        const { stocks } = req.body; // Array of stock_data strings

        if (!stocks || !Array.isArray(stocks) || stocks.length === 0) {
            return res.status(400).json({ success: false, error: 'กรุณาใส่ Key/Code อย่างน้อย 1 รายการ' });
        }

        // ตรวจสอบว่าสินค้ามีอยู่จริง
        const product = await getProductById(productId);
        if (!product) {
            return res.status(404).json({ success: false, error: 'ไม่พบสินค้า' });
        }

        // สร้างข้อมูลสำหรับ insert
        const stockItems = stocks
            .map(s => s.trim())
            .filter(s => s.length > 0)
            .map(stockData => ({
                product_id: productId,
                stock_data: stockData,
                is_sold: false
            }));

        if (stockItems.length === 0) {
            return res.status(400).json({ success: false, error: 'ไม่มี Key/Code ที่ถูกต้อง' });
        }

        const { data: inserted, error } = await supabaseAdmin
            .from('product_stocks')
            .insert(stockItems)
            .select();

        if (error) throw error;

        // อัพเดท stock count ใน products table
        const availableCount = await countAvailableStock(productId);
        await supabaseAdmin
            .from('products')
            .update({ stock: availableCount })
            .eq('product_id', productId);

        res.json({ 
            success: true, 
            message: `เพิ่ม ${inserted.length} Key/Code สำเร็จ`,
            added: inserted.length,
            totalAvailable: availableCount
        });
    } catch (error) {
        console.error('Add stocks error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// ลบ stock (เฉพาะที่ยังไม่ขาย)
app.delete('/api/admin/stocks/:id', requireAdmin, async (req, res) => {
    try {
        const stockId = req.params.id;

        // ตรวจสอบว่า stock ยังไม่ถูกขาย
        const { data: stock, error: checkError } = await supabaseAdmin
            .from('product_stocks')
            .select('*')
            .eq('id', stockId)
            .single();

        if (checkError || !stock) {
            return res.status(404).json({ success: false, error: 'ไม่พบ Stock' });
        }

        if (stock.is_sold) {
            return res.status(400).json({ success: false, error: 'ไม่สามารถลบ Stock ที่ขายแล้ว' });
        }

        const { error } = await supabaseAdmin
            .from('product_stocks')
            .delete()
            .eq('id', stockId);

        if (error) throw error;

        // อัพเดท stock count
        const availableCount = await countAvailableStock(stock.product_id);
        await supabaseAdmin
            .from('products')
            .update({ stock: availableCount })
            .eq('product_id', stock.product_id);

        res.json({ success: true });
    } catch (error) {
        console.error('Delete stock error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// Bulk import stocks จาก text (แต่ละบรรทัดคือ 1 stock)
// รองรับ 3 ประเภท: key, user_pass (user:pass), user_pass_cookie (user:pass:cookie)
app.post('/api/admin/products/:id/stocks/bulk', requireAdmin, async (req, res) => {
    try {
        const productId = req.params.id;
        const { text, stockType = 'key' } = req.body; // Text with one stock per line + stock type

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'กรุณาใส่ข้อมูล' });
        }

        // Validate stock type
        const validTypes = ['key', 'user_pass', 'user_pass_cookie'];
        if (!validTypes.includes(stockType)) {
            return res.status(400).json({ success: false, error: 'ประเภท stock ไม่ถูกต้อง' });
        }

        // แยกแต่ละบรรทัด
        const lines = text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (lines.length === 0) {
            return res.status(400).json({ success: false, error: 'ไม่พบข้อมูลที่ถูกต้อง' });
        }

        // ตรวจสอบว่าสินค้ามีอยู่จริง
        const product = await getProductById(productId);
        if (!product) {
            return res.status(404).json({ success: false, error: 'ไม่พบสินค้า' });
        }

        // สร้างข้อมูลสำหรับ insert ตามประเภท
        const stockItems = [];
        const errors = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            if (stockType === 'key') {
                // Key/Code ธรรมดา
                stockItems.push({
                    product_id: productId,
                    stock_type: 'key',
                    stock_data: line,
                    is_sold: false
                });
            } else if (stockType === 'user_pass') {
                // รูปแบบ user:pass
                const parts = line.split(':');
                if (parts.length < 2) {
                    errors.push(`บรรทัด ${lineNum}: รูปแบบไม่ถูกต้อง (ต้องเป็น user:pass)`);
                    continue;
                }
                const username = parts[0];
                const password = parts.slice(1).join(':'); // กรณี password มี :
                stockItems.push({
                    product_id: productId,
                    stock_type: 'user_pass',
                    stock_data: line,
                    username: username,
                    password: password,
                    is_sold: false
                });
            } else if (stockType === 'user_pass_cookie') {
                // รูปแบบ user:pass:cookie (cookie อาจยาวมากและมี : หลายตัว)
                const parts = line.split(':');
                if (parts.length < 3) {
                    errors.push(`บรรทัด ${lineNum}: รูปแบบไม่ถูกต้อง (ต้องเป็น user:pass:cookie)`);
                    continue;
                }
                const username = parts[0];
                const password = parts[1];
                const cookie = parts.slice(2).join(':'); // cookie คือส่วนที่เหลือทั้งหมด
                stockItems.push({
                    product_id: productId,
                    stock_type: 'user_pass_cookie',
                    stock_data: line,
                    username: username,
                    password: password,
                    cookie: cookie,
                    is_sold: false
                });
            }
        }

        if (stockItems.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'ไม่มีข้อมูลที่ถูกต้อง',
                details: errors 
            });
        }

        // ตรวจสอบว่า database รองรับ columns ใหม่หรือไม่
        // ถ้าไม่รองรับ ให้ใช้เฉพาะ stock_data เท่านั้น
        let insertData = stockItems;
        try {
            // ทดลอง insert ด้วย columns ใหม่
            const { data: inserted, error } = await supabaseAdmin
                .from('product_stocks')
                .insert(stockItems)
                .select();

            if (error) {
                // ถ้า error เกี่ยวกับ column ไม่มี ให้ใช้แบบเก่า
                if (error.message && (error.message.includes('column') || error.code === '42703')) {
                    console.log('Using legacy mode (without new columns)');
                    // ใช้เฉพาะ fields เดิม
                    const legacyItems = stockItems.map(item => ({
                        product_id: item.product_id,
                        stock_data: item.stock_data,
                        is_sold: item.is_sold
                    }));
                    
                    const { data: legacyInserted, error: legacyError } = await supabaseAdmin
                        .from('product_stocks')
                        .insert(legacyItems)
                        .select();
                    
                    if (legacyError) throw legacyError;
                    
                    // อัพเดท stock count
                    const availableCount = await countAvailableStock(productId);
                    await supabaseAdmin
                        .from('products')
                        .update({ stock: availableCount })
                        .eq('product_id', productId);

                    invalidateProductsCache(productId);

                    return res.json({ 
                        success: true, 
                        message: `Import ${legacyInserted.length} รายการสำเร็จ (Legacy Mode - กรุณารัน migration script)`,
                        added: legacyInserted.length,
                        totalAvailable: availableCount,
                        warning: 'Database ยังไม่รองรับ stock types ใหม่ กรุณารัน migration script',
                        errors: errors.length > 0 ? errors : undefined
                    });
                }
                throw error;
            }

            // อัพเดท stock count
            const availableCount = await countAvailableStock(productId);
            await supabaseAdmin
                .from('products')
                .update({ stock: availableCount })
                .eq('product_id', productId);

            // Invalidate cache
            invalidateProductsCache(productId);

            const typeLabel = stockType === 'key' ? 'Key/Code' : stockType === 'user_pass' ? 'User:Pass' : 'User:Pass:Cookie';
            res.json({ 
                success: true, 
                message: `Import ${inserted.length} ${typeLabel} สำเร็จ`,
                added: inserted.length,
                totalAvailable: availableCount,
                errors: errors.length > 0 ? errors : undefined
            });
        } catch (err) {
            throw err;
        }
    } catch (error) {
        console.error('Bulk import error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
});

// =============================================
// Health Check & System Endpoints
// =============================================

// Health Check (สำหรับ monitoring และ load balancer)
app.get('/health', async (req, res) => {
    try {
        // ตรวจสอบ database connection
        const { data, error } = await supabaseAdmin
            .from('products')
            .select('id')
            .limit(1);

        const dbStatus = error ? 'unhealthy' : 'healthy';
        const isHealthy = !error;

        res.status(isHealthy ? 200 : 503).json({
            status: isHealthy ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: isDevelopment ? 'development' : 'production',
            services: {
                database: dbStatus,
                server: 'healthy'
            }
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Service unavailable'
        });
    }
});

// Readiness Check (สำหรับ Kubernetes/Docker)
app.get('/ready', async (req, res) => {
    try {
        const { error } = await supabaseAdmin
            .from('products')
            .select('id')
            .limit(1);

        if (error) {
            return res.status(503).json({ ready: false });
        }
        res.json({ ready: true });
    } catch (error) {
        res.status(503).json({ ready: false });
    }
});

// Cache Statistics (Admin only)
app.get('/api/admin/cache-stats', requireAdmin, (req, res) => {
    const stats = getCacheStats();
    res.json({
        success: true,
        stats: stats
    });
});

// Clear Cache (Admin only)
app.post('/api/admin/clear-cache', requireAdmin, (req, res) => {
    clearAllCaches();
    res.json({
        success: true,
        message: 'All caches cleared'
    });
});

// =============================================
// Graceful Shutdown
// =============================================

const gracefulShutdown = (signal) => {
    console.log(`\n⚠️  ${signal} received. Shutting down gracefully...`);
    
    // ให้เวลา requests ที่กำลังทำงานอยู่เสร็จ
    server.close(() => {
        console.log('✅ Server closed. Process terminated.');
        process.exit(0);
    });

    // Force close หลัง 10 วินาที
    setTimeout(() => {
        console.error('❌ Could not close connections in time. Forcefully shutting down.');
        process.exit(1);
    }, 10000);
};

// =============================================
// Start Server
// =============================================

const server = app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════╗
║         🎮 Dips Hub Server Started         ║
╠════════════════════════════════════════════╣
║  Local:   http://localhost:${PORT}            ║
║  Mode:    ${isDevelopment ? 'Development' : 'Production '}                      ║
║  Status:  Ready                            ║
╚════════════════════════════════════════════╝
    `);
    
    if (!CLIENT_ID || CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
        console.log('⚠️  Warning: Discord Client ID not configured!');
        console.log('   Please update .env file with your Discord credentials.');
    }
});

// Listen for shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));


