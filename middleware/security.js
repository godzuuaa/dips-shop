/**
 * Security Middleware
 * Rate Limiting, IP Blocking, และการป้องกันภัยคุกคาม
 */

const rateLimit = require('express-rate-limit');

// Audit Logger (lazy load to avoid circular dependency)
let auditLogger = null;
const getAuditLogger = () => {
    if (!auditLogger) {
        try {
            auditLogger = require('../utils/auditLogger');
        } catch (e) {
            console.warn('Audit logger not available:', e.message);
        }
    }
    return auditLogger;
};

// ============================================
// Rate Limiters
// ============================================

// General API Rate Limit (100 requests ต่อ 15 นาที)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: {
        success: false,
        error: 'Too many requests, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Login Rate Limit (5 attempts ต่อ 15 นาที)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
        success: false,
        error: 'Too many login attempts, please try again after 15 minutes.'
    },
    skipSuccessfulRequests: true,
});

// Purchase Rate Limit (10 purchases ต่อ 5 นาที)
const purchaseLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10,
    message: {
        success: false,
        error: 'Too many purchases, please slow down.'
    },
});

// Admin Action Rate Limit (50 actions ต่อ 10 นาที)
const adminLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 50,
    message: {
        success: false,
        error: 'Too many admin actions, please slow down.'
    },
});

// Strict Rate Limit สำหรับ sensitive endpoints (3 attempts ต่อ 10 นาที)
const strictLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 3,
    message: {
        success: false,
        error: 'Too many attempts. Access temporarily blocked.'
    },
});

// ============================================
// IP Blocking
// ============================================

const blockedIPs = new Set();

const ipBlocker = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    
    if (blockedIPs.has(ip)) {
        return res.status(403).json({
            success: false,
            error: 'Access denied. Your IP has been blocked.'
        });
    }
    
    next();
};

// Function to block IP
const blockIP = (ip, duration = 3600000) => { // default 1 hour
    blockedIPs.add(ip);
    
    // Auto-unblock after duration
    setTimeout(() => {
        blockedIPs.delete(ip);
    }, duration);
};

// ============================================
// Request Logger (สำหรับ Security Audit)
// ============================================

const requestLogger = (req, res, next) => {
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.connection.remoteAddress;
    const method = req.method;
    const url = req.originalUrl;
    const userAgent = req.get('user-agent');
    
    // Log suspicious activity
    if (method === 'POST' || method === 'DELETE' || method === 'PUT') {
        console.log(`[${timestamp}] ${method} ${url} from ${ip}`);
    }
    
    next();
};

// ============================================
// Detect Suspicious Activity
// ============================================

const suspiciousPatterns = [
    /(\%27)|(\')|(\-\-)|(\%23)|(#)/i, // SQL injection
    /<script|<iframe|javascript:/i,    // XSS
    /\.\.\/|\.\.\\|etc\/passwd/i,     // Path traversal
];

const detectSuspiciousActivity = (req, res, next) => {
    const checkString = JSON.stringify(req.body) + JSON.stringify(req.query) + req.url;
    
    for (const pattern of suspiciousPatterns) {
        if (pattern.test(checkString)) {
            const ip = req.ip || req.connection.remoteAddress;
            console.warn(`⚠️  Suspicious activity detected from ${ip}: ${req.url}`);
            
            // Log to security events
            const logger = getAuditLogger();
            if (logger) {
                logger.logSecurityEvent({
                    eventType: logger.SecurityEventTypes.SUSPICIOUS_ACTIVITY,
                    severity: 'high',
                    userId: req.session?.user?.id,
                    details: {
                        url: req.url,
                        method: req.method,
                        pattern: pattern.toString()
                    },
                    req
                }).catch(() => {});
            }
            
            // Block IP on repeated suspicious activity
            blockIP(ip, 3600000); // 1 hour
            
            return res.status(400).json({
                success: false,
                error: 'Invalid request detected.'
            });
        }
    }
    
    next();
};

// ============================================
// Prevent Parameter Pollution
// ============================================

const preventParameterPollution = (req, res, next) => {
    // ตรวจสอบว่ามี parameter ซ้ำไหม
    for (const key in req.query) {
        if (Array.isArray(req.query[key])) {
            req.query[key] = req.query[key][0]; // ใช้ค่าแรกเท่านั้น
        }
    }
    
    next();
};

// ============================================
// CORS Configuration
// ============================================

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            process.env.FRONTEND_URL
        ].filter(Boolean);
        
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`⚠️  CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

// ============================================
// Export
// ============================================

module.exports = {
    // Rate Limiters
    apiLimiter,
    loginLimiter,
    purchaseLimiter,
    adminLimiter,
    strictLimiter,
    
    // IP Blocking
    ipBlocker,
    blockIP,
    
    // Security
    requestLogger,
    detectSuspiciousActivity,
    preventParameterPollution,
    
    // CORS
    corsOptions
};
