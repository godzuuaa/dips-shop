/**
 * Centralized Error Handler
 * จัดการ error ทั้งหมดในที่เดียว ป้องกัน error leakage
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

// =============================================
// Custom Error Classes
// =============================================

class AppError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.timestamp = new Date().toISOString();
        
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    constructor(message, details = null) {
        super(message, 400);
        this.details = details;
    }
}

class AuthenticationError extends AppError {
    constructor(message = 'Authentication required') {
        super(message, 401);
    }
}

class AuthorizationError extends AppError {
    constructor(message = 'Access denied') {
        super(message, 403);
    }
}

class NotFoundError extends AppError {
    constructor(resource = 'Resource') {
        super(`${resource} not found`, 404);
    }
}

class ConflictError extends AppError {
    constructor(message = 'Resource already exists') {
        super(message, 409);
    }
}

class RateLimitError extends AppError {
    constructor(message = 'Too many requests') {
        super(message, 429);
    }
}

// =============================================
// Error Handler Middleware
// =============================================

function errorHandler(err, req, res, next) {
    let error = { ...err };
    error.message = err.message;
    error.stack = err.stack;

    // Log error
    logError(err, req);

    // Handle specific error types
    if (err.name === 'ValidationError') {
        error = new ValidationError(err.message, err.details);
    }

    if (err.name === 'CastError') {
        error = new ValidationError('Invalid ID format');
    }

    if (err.code === '23505' || err.code === 'PGRST116') {
        // PostgreSQL unique violation
        error = new ConflictError('Resource already exists');
    }

    if (err.name === 'JsonWebTokenError') {
        error = new AuthenticationError('Invalid token');
    }

    if (err.name === 'TokenExpiredError') {
        error = new AuthenticationError('Token expired');
    }

    // Send response
    res.status(error.statusCode || 500).json({
        success: false,
        error: getErrorMessage(error),
        ...(isDevelopment && {
            stack: error.stack,
            details: error.details
        }),
        timestamp: new Date().toISOString()
    });
}

// =============================================
// Helper Functions
// =============================================

function getErrorMessage(error) {
    if (error.isOperational) {
        return error.message;
    }

    // ซ่อนรายละเอียดของ programming errors ใน production
    if (isDevelopment) {
        return error.message;
    }

    return 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง';
}

function logError(error, req = null) {
    const timestamp = new Date().toISOString();
    const ip = req ? (req.ip || req.connection.remoteAddress) : 'unknown';
    const url = req ? req.originalUrl : 'unknown';
    const method = req ? req.method : 'unknown';

    console.error(`
╔════════════════════════════════════════════
║ ❌ ERROR LOG
╠════════════════════════════════════════════
║ Timestamp: ${timestamp}
║ IP: ${ip}
║ ${method} ${url}
╠════════════════════════════════════════════
║ Message: ${error.message}
║ Status: ${error.statusCode || 500}
║ Stack: ${error.stack || 'No stack trace'}
╚════════════════════════════════════════════
    `);

    // TODO: Send to external logging service (Sentry, LogRocket, etc.)
    // if (process.env.SENTRY_DSN) {
    //     Sentry.captureException(error);
    // }
}

// =============================================
// Async Error Wrapper
// =============================================

/**
 * Wrap async route handlers to catch errors automatically
 * Usage: app.get('/route', asyncHandler(async (req, res) => {...}))
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// =============================================
// 404 Handler
// =============================================

function notFoundHandler(req, res, next) {
    const error = new NotFoundError(`Route ${req.originalUrl}`);
    next(error);
}

// =============================================
// Unhandled Rejection Handler
// =============================================

function handleUnhandledRejection() {
    process.on('unhandledRejection', (reason, promise) => {
        console.error('🔥 Unhandled Rejection at:', promise);
        console.error('Reason:', reason);
        
        // Exit process in production
        if (!isDevelopment) {
            process.exit(1);
        }
    });
}

function handleUncaughtException() {
    process.on('uncaughtException', (error) => {
        console.error('💥 Uncaught Exception:');
        console.error(error);
        
        // Exit process
        process.exit(1);
    });
}

// =============================================
// Database Error Handlers
// =============================================

function handleDatabaseError(error) {
    // Supabase/PostgreSQL specific errors
    const errorMap = {
        '23505': 'Duplicate entry',
        '23503': 'Foreign key violation',
        '23502': 'Not null violation',
        '22P02': 'Invalid text representation',
        'PGRST116': 'No rows found'
    };

    const message = errorMap[error.code] || 'Database error';
    return new AppError(message, 500);
}

// =============================================
// Export
// =============================================

module.exports = {
    // Custom Errors
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    RateLimitError,

    // Middleware
    errorHandler,
    notFoundHandler,
    asyncHandler,

    // Handlers
    handleUnhandledRejection,
    handleUncaughtException,
    handleDatabaseError,

    // Utilities
    logError
};
