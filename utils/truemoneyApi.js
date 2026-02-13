/**
 * TrueMoney API Service
 * รองรับหลาย Provider: topup2p, paywong, custom
 */

const https = require('https');
const http = require('http');

// Provider Configurations
const PROVIDERS = {
    // EasySlip API (Official)
    easyslip: {
        name: 'EasySlip',
        baseUrl: 'https://developer.easyslip.com',
        redeemEndpoint: '/api/v1/voucher/redeem',
        authHeader: 'Authorization',
        authPrefix: 'Bearer '
    },
    // Thunder Solution API
    thunder: {
        name: 'Thunder Solution',
        baseUrl: 'https://api.thunder.in.th',
        redeemEndpoint: '/api/redeem',
        authHeader: 'Authorization',
        authPrefix: ''
    },
    // Topup2P API
    topup2p: {
        name: 'Topup2P',
        baseUrl: 'https://api.topup2p.com',
        redeemEndpoint: '/v1/truemoney/voucher/redeem',
        authHeader: 'Authorization',
        authPrefix: 'Bearer '
    },
    // PayWong API  
    paywong: {
        name: 'PayWong',
        baseUrl: 'https://api.paywong.com',
        redeemEndpoint: '/truemoney/redeem',
        authHeader: 'X-API-Key',
        authPrefix: ''
    },
    // Custom สำหรับ Self-hosted API
    custom: {
        name: 'Custom',
        baseUrl: process.env.TRUEMONEY_CUSTOM_URL || 'http://localhost:8080',
        redeemEndpoint: '/redeem',
        authHeader: 'X-API-Key',
        authPrefix: ''
    }
};

/**
 * แยก Voucher Hash จาก URL ซองอั่งเปา
 * รองรับหลายรูปแบบ:
 * - https://gift.truemoney.com/campaign/?v=XXXXXXXX
 * - https://gift.truemoney.com/campaign?v=XXXXXXXX  
 * - XXXXXXXX (voucher hash โดยตรง)
 */
function extractVoucherHash(input) {
    if (!input || typeof input !== 'string') {
        return null;
    }
    
    input = input.trim();
    
    // ถ้าเป็น URL
    if (input.includes('gift.truemoney.com')) {
        try {
            const url = new URL(input);
            const voucherHash = url.searchParams.get('v');
            if (voucherHash && voucherHash.length >= 8) {
                return voucherHash;
            }
        } catch (e) {
            // ลอง regex
            const match = input.match(/[?&]v=([a-zA-Z0-9]+)/);
            if (match && match[1]) {
                return match[1];
            }
        }
    }
    
    // ถ้าเป็น voucher hash โดยตรง (ตัวอักษรและตัวเลข >=8 ตัว)
    if (/^[a-zA-Z0-9]{8,}$/.test(input)) {
        return input;
    }
    
    return null;
}

/**
 * ตรวจสอบว่า Voucher ถูกใช้ไปแล้วหรือไม่ (local cache)
 */
const usedVouchers = new Set();

function isVoucherUsed(voucherHash) {
    return usedVouchers.has(voucherHash);
}

function markVoucherUsed(voucherHash) {
    usedVouchers.add(voucherHash);
    // เก็บแค่ 10000 รายการล่าสุด
    if (usedVouchers.size > 10000) {
        const first = usedVouchers.values().next().value;
        usedVouchers.delete(first);
    }
}

/**
 * ส่งคำขอ HTTP/HTTPS
 */
function httpRequest(url, options, data = null) {
    return new Promise((resolve, reject) => {
        const isHttps = url.startsWith('https');
        const client = isHttps ? https : http;
        
        const urlObj = new URL(url);
        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: 30000
        };
        
        const req = client.request(reqOptions, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

/**
 * Redeem ซองอั่งเปา TrueMoney ผ่าน Provider API
 * @param {string} voucherLink - ลิ้งซองอั่งเปาหรือ voucher hash
 * @returns {Promise<{success: boolean, amount?: number, message?: string, transactionId?: string}>}
 */
async function redeemAngpao(voucherLink) {
    // ตรวจสอบว่าระบบเปิดใช้งานหรือไม่
    if (process.env.TRUEMONEY_ANGPAO_ENABLED !== 'true') {
        return {
            success: false,
            message: 'ระบบซองอั่งเปาปิดใช้งานอยู่'
        };
    }
    
    // แยก voucher hash
    const voucherHash = extractVoucherHash(voucherLink);
    if (!voucherHash) {
        return {
            success: false,
            message: 'รูปแบบลิ้งซองอั่งเปาไม่ถูกต้อง'
        };
    }
    
    // ตรวจสอบว่าใช้ไปแล้วหรือไม่ (local check)
    if (isVoucherUsed(voucherHash)) {
        return {
            success: false,
            message: 'ซองอั่งเปานี้ถูกใช้ไปแล้ว'
        };
    }
    
    // ดึง Provider config
    const providerName = process.env.TRUEMONEY_PROVIDER || 'topup2p';
    const provider = PROVIDERS[providerName];
    
    if (!provider) {
        return {
            success: false,
            message: 'Provider ไม่ถูกต้อง'
        };
    }
    
    // ตรวจสอบ API Key
    const apiKey = process.env.TRUEMONEY_API_KEY;
    if (!apiKey) {
        return {
            success: false,
            message: 'ยังไม่ได้ตั้งค่า API Key'
        };
    }
    
    const phone = process.env.TRUEMONEY_PHONE;
    if (!phone) {
        return {
            success: false,
            message: 'ยังไม่ได้ตั้งค่าเบอร์โทร TrueMoney'
        };
    }
    
    try {
        // ส่งคำขอไป Provider
        const url = provider.baseUrl + provider.redeemEndpoint;
        const headers = {
            'Content-Type': 'application/json',
            [provider.authHeader]: provider.authPrefix + apiKey
        };
        
        // เพิ่ม API Secret ถ้ามี
        if (process.env.TRUEMONEY_API_SECRET) {
            headers['X-API-Secret'] = process.env.TRUEMONEY_API_SECRET;
        }
        
        // สร้าง request body ตาม provider
        let requestBody;
        if (providerName === 'easyslip') {
            // EasySlip format
            requestBody = {
                voucher_url: voucherLink,
                phone_number: phone
            };
        } else {
            // Standard format for other providers
            requestBody = {
                voucher_hash: voucherHash,
                mobile: phone,
                voucher_url: voucherLink
            };
        }
        
        const response = await httpRequest(url, { 
            method: 'POST', 
            headers 
        }, requestBody);
        
        // ตรวจสอบ response
        if (response.status === 200 && response.data) {
            const data = response.data;
            
            // ตรวจสอบการ redeem สำเร็จ (รองรับหลาย format)
            // EasySlip: data.status === 200
            // Others: data.success === true, data.status === 'success', etc.
            const isSuccess = data.success === true || 
                              data.status === 'success' || 
                              data.status === 200 ||
                              data.code === 200 ||
                              data.result === 'ok';
            
            if (isSuccess) {
                // แยกจำนวนเงิน (รองรับหลาย field)
                // EasySlip: data.amount
                const amount = parseFloat(data.amount || data.data?.amount || data.voucher_amount || 0);
                const transactionId = data.transaction_id || data.txn_id || data.ref || Date.now().toString();
                
                // ตรวจสอบจำนวนเงิน
                const minAmount = parseFloat(process.env.TRUEMONEY_MIN_AMOUNT || 10);
                const maxAmount = parseFloat(process.env.TRUEMONEY_MAX_AMOUNT || 5000);
                
                if (amount < minAmount) {
                    return {
                        success: false,
                        message: `จำนวนเงินต่ำกว่าขั้นต่ำ (${minAmount} บาท)`
                    };
                }
                
                if (amount > maxAmount) {
                    return {
                        success: false,
                        message: `จำนวนเงินเกินที่กำหนด (สูงสุด ${maxAmount} บาท)`
                    };
                }
                
                // บันทึกว่าใช้ voucher แล้ว
                markVoucherUsed(voucherHash);
                
                return {
                    success: true,
                    amount: amount,
                    transactionId: transactionId,
                    message: `รับเงินสำเร็จ ${amount} บาท`
                };
            } else {
                // Redeem ไม่สำเร็จ
                const errorMsg = data.message || data.error || data.msg || 'ไม่สามารถรับซองอั่งเปาได้';
                
                // ตรวจสอบว่าใช้ไปแล้วหรือยัง
                if (errorMsg.includes('ใช้') || errorMsg.includes('used') || errorMsg.includes('claimed')) {
                    markVoucherUsed(voucherHash);
                }
                
                return {
                    success: false,
                    message: errorMsg
                };
            }
        } else {
            // HTTP error
            return {
                success: false,
                message: `เกิดข้อผิดพลาดจาก API (${response.status})`
            };
        }
    } catch (error) {
        console.error('TrueMoney API Error:', error);
        return {
            success: false,
            message: 'ไม่สามารถเชื่อมต่อกับ API ได้'
        };
    }
}

/**
 * ตรวจสอบสถานะการตั้งค่า TrueMoney
 */
function getConfigStatus() {
    return {
        enabled: process.env.TRUEMONEY_ANGPAO_ENABLED === 'true',
        provider: process.env.TRUEMONEY_PROVIDER || 'topup2p',
        hasPhone: !!process.env.TRUEMONEY_PHONE,
        hasApiKey: !!process.env.TRUEMONEY_API_KEY,
        minAmount: parseFloat(process.env.TRUEMONEY_MIN_AMOUNT || 10),
        maxAmount: parseFloat(process.env.TRUEMONEY_MAX_AMOUNT || 5000)
    };
}

/**
 * Validate voucher format โดยไม่ redeem
 */
function validateVoucherFormat(voucherLink) {
    const voucherHash = extractVoucherHash(voucherLink);
    return {
        valid: !!voucherHash,
        voucherHash: voucherHash,
        alreadyUsed: voucherHash ? isVoucherUsed(voucherHash) : false
    };
}

module.exports = {
    redeemAngpao,
    getConfigStatus,
    validateVoucherFormat,
    extractVoucherHash
};
