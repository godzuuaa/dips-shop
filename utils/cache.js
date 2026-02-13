/**
 * Caching System
 * ใช้ node-cache สำหรับ in-memory caching เพื่อลด database queries
 */

const NodeCache = require('node-cache');

// =============================================
// Cache Configuration
// =============================================

// Products Cache - 5 minutes TTL
const productsCache = new NodeCache({
    stdTTL: 300, // 5 minutes
    checkperiod: 60, // Check for expired keys every 60 seconds
    useClones: false // ประหยัด memory
});

// Category Cache - 10 minutes TTL
const categoryCache = new NodeCache({
    stdTTL: 600,
    checkperiod: 120
});

// User Cache - 15 minutes TTL
const userCache = new NodeCache({
    stdTTL: 900,
    checkperiod: 180
});

// Wallet Cache - 2 minutes TTL (ต้อง fresh)
const walletCache = new NodeCache({
    stdTTL: 120,
    checkperiod: 30
});

// Stock Count Cache - 1 minute TTL
const stockCache = new NodeCache({
    stdTTL: 60,
    checkperiod: 15
});

// =============================================
// Cache Helper Functions
// =============================================

/**
 * Get or Set pattern
 * ถ้ามีใน cache ให้ใช้ ถ้าไม่มีให้เรียก callback และ cache result
 */
async function getOrSet(cache, key, callback, ttl = null) {
    // ตรวจสอบใน cache
    const cached = cache.get(key);
    if (cached !== undefined) {
        return cached;
    }

    // ถ้าไม่มี ให้เรียก callback
    try {
        const result = await callback();
        
        // Cache result
        if (ttl) {
            cache.set(key, result, ttl);
        } else {
            cache.set(key, result);
        }
        
        return result;
    } catch (error) {
        console.error(`Cache error for key ${key}:`, error);
        throw error;
    }
}

/**
 * Invalidate cache pattern
 */
function invalidate(cache, pattern) {
    const keys = cache.keys();
    
    if (pattern instanceof RegExp) {
        // Regex pattern
        keys.forEach(key => {
            if (pattern.test(key)) {
                cache.del(key);
            }
        });
    } else {
        // Exact key
        cache.del(pattern);
    }
}

/**
 * Clear all caches
 */
function clearAllCaches() {
    productsCache.flushAll();
    categoryCache.flushAll();
    userCache.flushAll();
    walletCache.flushAll();
    stockCache.flushAll();
}

// =============================================
// Specific Cache Functions
// =============================================

/**
 * Cache Products
 */
async function getCachedProducts(category = null, fetchCallback) {
    const key = category ? `products_${category}` : 'products_all';
    return await getOrSet(productsCache, key, fetchCallback);
}

function invalidateProductsCache(productId = null) {
    // Clear all products cache เพื่อให้แน่ใจว่าข้อมูลใหม่จะถูกโหลด
    productsCache.flushAll();
    // ต้อง clear stock cache ด้วย
    stockCache.flushAll();
}

/**
 * Cache User Balance
 */
async function getCachedBalance(userId, fetchCallback) {
    const key = `balance_${userId}`;
    return await getOrSet(walletCache, key, fetchCallback);
}

function invalidateBalanceCache(userId) {
    walletCache.del(`balance_${userId}`);
}

/**
 * Cache Stock Count
 */
async function getCachedStockCount(productId, fetchCallback) {
    const key = `stock_${productId}`;
    return await getOrSet(stockCache, key, fetchCallback, 60); // 1 minute
}

function invalidateStockCache(productId) {
    stockCache.del(`stock_${productId}`);
    // ต้อง invalidate products cache ด้วย
    invalidateProductsCache(productId);
}

/**
 * Cache User Data
 */
async function getCachedUser(userId, fetchCallback) {
    const key = `user_${userId}`;
    return await getOrSet(userCache, key, fetchCallback);
}

function invalidateUserCache(userId) {
    userCache.del(`user_${userId}`);
}

// =============================================
// Cache Statistics
// =============================================

function getCacheStats() {
    return {
        products: productsCache.getStats(),
        categories: categoryCache.getStats(),
        users: userCache.getStats(),
        wallets: walletCache.getStats(),
        stocks: stockCache.getStats()
    };
}

// =============================================
// Cache Warming (Optional)
// =============================================

/**
 * Pre-load frequently accessed data into cache
 */
async function warmCache(fetchProductsCallback) {
    try {
        console.log('🔥 Warming up cache...');
        
        // Pre-load all products
        await getCachedProducts(null, fetchProductsCallback);
        
        console.log('✅ Cache warmed successfully');
    } catch (error) {
        console.error('❌ Cache warming failed:', error);
    }
}

// =============================================
// Export
// =============================================

module.exports = {
    // Cache instances
    productsCache,
    categoryCache,
    userCache,
    walletCache,
    stockCache,

    // Helper functions
    getOrSet,
    invalidate,
    clearAllCaches,

    // Specific functions
    getCachedProducts,
    invalidateProductsCache,
    getCachedBalance,
    invalidateBalanceCache,
    getCachedStockCount,
    invalidateStockCache,
    getCachedUser,
    invalidateUserCache,

    // Stats & Warming
    getCacheStats,
    warmCache
};
