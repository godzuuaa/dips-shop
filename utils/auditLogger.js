/**
 * Audit Logging Utility
 * เก็บ Log การกระทำของ Admin และเหตุการณ์ความปลอดภัย
 */

const { supabaseAdmin } = require('../config/supabase');

// ============================================
// Audit Log Functions
// ============================================

/**
 * บันทึก Audit Log
 * @param {Object} options
 * @param {string} options.userId - Discord ID ของผู้กระทำ
 * @param {string} options.username - Username สำหรับแสดง
 * @param {string} options.action - create, update, delete, topup, etc.
 * @param {string} options.resourceType - product, user, order, stock, etc.
 * @param {string} options.resourceId - ID ของ resource
 * @param {Object} options.oldValue - ค่าเก่า
 * @param {Object} options.newValue - ค่าใหม่
 * @param {Object} options.req - Express request object (สำหรับ IP/User-Agent)
 */
async function logAudit({
    userId,
    username,
    action,
    resourceType,
    resourceId,
    oldValue = null,
    newValue = null,
    req = null
}) {
    try {
        const ip = req ? (req.ip || req.connection?.remoteAddress || 'unknown') : 'unknown';
        const userAgent = req ? req.get('user-agent') : null;

        await supabaseAdmin.from('audit_logs').insert({
            user_id: userId,
            username: username,
            action: action,
            resource_type: resourceType,
            resource_id: resourceId,
            old_value: oldValue,
            new_value: newValue,
            ip_address: ip,
            user_agent: userAgent
        });

        // Log to console in development
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[AUDIT] ${username} ${action} ${resourceType} ${resourceId || ''}`);
        }
    } catch (error) {
        // Don't throw - logging should not break the main operation
        console.error('Audit log error:', error.message);
    }
}

// ============================================
// Security Event Functions
// ============================================

/**
 * บันทึก Security Event
 * @param {Object} options
 * @param {string} options.eventType - login_failed, suspicious_activity, ip_blocked, rate_limit_exceeded
 * @param {string} options.severity - low, medium, high, critical
 * @param {string} options.userId - Discord ID (ถ้ามี)
 * @param {Object} options.details - รายละเอียดเพิ่มเติม
 * @param {Object} options.req - Express request object
 */
async function logSecurityEvent({
    eventType,
    severity = 'medium',
    userId = null,
    details = {},
    req = null
}) {
    try {
        const ip = req ? (req.ip || req.connection?.remoteAddress || 'unknown') : 'unknown';
        const userAgent = req ? req.get('user-agent') : null;

        await supabaseAdmin.from('security_events').insert({
            event_type: eventType,
            severity: severity,
            user_id: userId,
            ip_address: ip,
            user_agent: userAgent,
            details: details
        });

        // Alert for critical events
        if (severity === 'critical' || severity === 'high') {
            console.warn(`🚨 [SECURITY] ${severity.toUpperCase()}: ${eventType} from ${ip}`);
        }
    } catch (error) {
        console.error('Security log error:', error.message);
    }
}

// ============================================
// Predefined Event Types
// ============================================

const SecurityEventTypes = {
    LOGIN_FAILED: 'login_failed',
    LOGIN_SUCCESS: 'login_success',
    LOGOUT: 'logout',
    SUSPICIOUS_ACTIVITY: 'suspicious_activity',
    IP_BLOCKED: 'ip_blocked',
    RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
    INVALID_CSRF: 'invalid_csrf',
    SQL_INJECTION_ATTEMPT: 'sql_injection_attempt',
    XSS_ATTEMPT: 'xss_attempt',
    UNAUTHORIZED_ACCESS: 'unauthorized_access',
    ADMIN_ACTION: 'admin_action'
};

const AuditActions = {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    TOPUP: 'topup',
    PURCHASE: 'purchase',
    REFUND: 'refund',
    STOCK_ADD: 'stock_add',
    STOCK_DELETE: 'stock_delete',
    STATUS_CHANGE: 'status_change'
};

const ResourceTypes = {
    PRODUCT: 'product',
    USER: 'user',
    ORDER: 'order',
    STOCK: 'stock',
    TRANSACTION: 'transaction',
    COUPON: 'coupon',
    WALLET: 'wallet'
};

// ============================================
// Export
// ============================================

module.exports = {
    logAudit,
    logSecurityEvent,
    SecurityEventTypes,
    AuditActions,
    ResourceTypes
};
