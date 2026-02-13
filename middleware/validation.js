/**
 * Input Validation Middleware
 * ป้องกัน SQL Injection, XSS และ Invalid Input
 */

const { body, param, query, validationResult } = require('express-validator');
const Joi = require('joi');

// ============================================
// Express Validator Rules
// ============================================

// Validation สำหรับการซื้อสินค้า
const purchaseValidation = [
    param('id').trim().notEmpty().withMessage('Product ID is required'),
    body('quantity')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Quantity must be between 1-100'),
];

// Validation สำหรับการเติมเงิน
const topupValidation = [
    body('amount')
        .isFloat({ min: 1, max: 100000 })
        .withMessage('Amount must be between 1-100,000'),
    body('slip')
        .optional()
        .isURL()
        .withMessage('Slip must be a valid URL'),
];

// Validation สำหรับการสร้างสินค้า (Admin)
const createProductValidation = [
    body('product_id')
        .trim()
        .matches(/^[a-zA-Z0-9-_]+$/)
        .withMessage('Product ID can only contain letters, numbers, dash and underscore'),
    body('name')
        .trim()
        .isLength({ min: 3, max: 200 })
        .withMessage('Product name must be 3-200 characters'),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 2000 })
        .withMessage('Description must not exceed 2000 characters'),
    body('price')
        .isFloat({ min: 0, max: 999999 })
        .withMessage('Price must be between 0-999,999'),
    body('category')
        .trim()
        .notEmpty()
        .withMessage('Category is required'),
    body('stock')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Stock must be a positive number'),
];

// Validation สำหรับการเพิ่ม Stock
const addStockValidation = [
    body('text')
        .trim()
        .notEmpty()
        .withMessage('Stock keys cannot be empty')
        .isLength({ max: 50000 })
        .withMessage('Input too large'),
];

// Validation สำหรับคูปอง
const couponValidation = [
    body('code')
        .trim()
        .matches(/^[A-Z0-9-_]+$/)
        .withMessage('Coupon code can only contain uppercase letters, numbers, dash and underscore'),
    body('type')
        .isIn(['fixed', 'percent'])
        .withMessage('Type must be fixed or percent'),
    body('value')
        .isFloat({ min: 0 })
        .withMessage('Value must be positive'),
];

// ============================================
// Middleware: ตรวจสอบ Validation Result
// ============================================

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array().map(err => ({
                field: err.path,
                message: err.msg
            }))
        });
    }
    next();
};

// ============================================
// Joi Schema Validation (Alternative)
// ============================================

const joiSchemas = {
    // Schema สำหรับ Product
    product: Joi.object({
        product_id: Joi.string().pattern(/^[a-zA-Z0-9-_]+$/).required(),
        name: Joi.string().min(3).max(200).required(),
        description: Joi.string().max(2000).allow(''),
        price: Joi.number().min(0).max(999999).required(),
        original_price: Joi.number().min(0).max(999999).optional(),
        category: Joi.string().required(),
        image: Joi.string().uri().allow('').optional(),
        stock: Joi.number().integer().min(0).optional(),
        is_active: Joi.boolean().optional(),
        features: Joi.array().items(Joi.string()).optional()
    }),

    // Schema สำหรับ Topup
    topup: Joi.object({
        amount: Joi.number().min(1).max(100000).required(),
        slip: Joi.string().uri().optional(),
        method: Joi.string().valid('truemoney', 'promptpay', 'bank').optional()
    }),

    // Schema สำหรับ Purchase
    purchase: Joi.object({
        quantity: Joi.number().integer().min(1).max(100).default(1)
    })
};

// Middleware สำหรับ Joi validation
const validateWithJoi = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message
                }))
            });
        }

        // แทนที่ req.body ด้วย validated value
        req.body = value;
        next();
    };
};

// ============================================
// Sanitize Input (ป้องกัน XSS)
// ============================================

const sanitizeInput = (input) => {
    if (typeof input === 'string') {
        return input
            .replace(/[<>]/g, '') // ลบ < >
            .trim();
    }
    return input;
};

const sanitizeBody = (req, res, next) => {
    if (req.body) {
        Object.keys(req.body).forEach(key => {
            req.body[key] = sanitizeInput(req.body[key]);
        });
    }
    next();
};

// ============================================
// Export
// ============================================

module.exports = {
    // Express Validator
    purchaseValidation,
    topupValidation,
    createProductValidation,
    addStockValidation,
    couponValidation,
    validate,

    // Joi
    joiSchemas,
    validateWithJoi,

    // Sanitize
    sanitizeBody,
    sanitizeInput
};
