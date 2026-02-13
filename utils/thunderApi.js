/**
 * Thunder Solution API Service
 * ระบบตรวจสอบ Slip และสร้าง QR PromptPay
 * Website: https://www.thundersolution.io.th
 */

const https = require('https');

// Thunder API Configuration
const THUNDER_CONFIG = {
    baseUrl: 'https://api.thunder.in.th/v1',
    apiKey: process.env.THUNDER_API_KEY || '',
    minAmount: parseInt(process.env.THUNDER_MIN_AMOUNT) || 10,
    maxAmount: parseInt(process.env.THUNDER_MAX_AMOUNT) || 10000
};

/**
 * สร้าง QR Code PromptPay (ไม่ต้องใช้ API - ใช้มาตรฐาน Thai QR Payment)
 */
function generatePromptPayQR(promptPayId, amount) {
    // Format PromptPay ID (เบอร์โทร 10 หลัก หรือ เลขบัตร 13 หลัก)
    let formattedId = promptPayId.replace(/[^0-9]/g, '');
    
    // Helper function to create TLV (Tag-Length-Value)
    function tlv(tag, value) {
        return tag + String(value.length).padStart(2, '0') + value;
    }
    
    // Merchant Account Information (ID: 29) for PromptPay
    let merchantAccountInfo;
    const aid = 'A000000677010111';  // PromptPay AID (16 chars)
    
    if (formattedId.length === 10) {
        // เบอร์โทร - format: 0066 + 9 digits (ลบเลข 0 หน้า)
        const phoneNumber = '0066' + formattedId.slice(1);
        merchantAccountInfo = tlv('00', aid) + tlv('01', phoneNumber);
    } else if (formattedId.length === 13) {
        // เลขบัตรประชาชน
        merchantAccountInfo = tlv('00', aid) + tlv('02', formattedId);
    } else {
        return { success: false, error: 'PromptPay ID ไม่ถูกต้อง' };
    }
    
    // Build EMVCo QR payload
    let payload = '';
    payload += tlv('00', '01');  // Payload Format Indicator
    payload += tlv('01', '12');  // Point of Initiation Method (12 = Dynamic)
    payload += tlv('29', merchantAccountInfo);  // Merchant Account Info (PromptPay)
    payload += tlv('53', '764');  // Transaction Currency (THB)
    payload += tlv('54', amount.toFixed(2));  // Transaction Amount
    payload += tlv('58', 'TH');  // Country Code
    
    // Add CRC placeholder
    payload += '6304';
    
    // Calculate and append CRC16-CCITT
    const crc = calculateCRC16(payload);
    payload += crc;
    
    return {
        success: true,
        qrCode: payload,
        amount: amount
    };
}

/**
 * Calculate CRC16-CCITT (PromptPay standard)
 */
function calculateCRC16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
        crc ^= str.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc <<= 1;
            }
            crc &= 0xFFFF;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * ทำ HTTP Request ไปยัง Thunder API
 */
function makeRequest(method, endpoint, data = null) {
    return new Promise((resolve, reject) => {
        // สร้าง full path โดยรวม basePath + endpoint
        const fullPath = '/v1' + endpoint;
        
        const options = {
            hostname: 'api.thunder.in.th',
            port: 443,
            path: fullPath,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${THUNDER_CONFIG.apiKey}`,
                'Accept': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
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
        req.setTimeout(30000, () => {
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
 * ตรวจสอบ Slip ธนาคาร (EasySlip API)
 * @param {string} slipData - Base64 ของรูป slip
 * @returns {Promise<Object>} ผลการตรวจสอบ
 */
async function verifySlip(slipData) {
    try {
        if (!THUNDER_CONFIG.apiKey) {
            return {
                success: false,
                error: 'API Key not configured'
            };
        }

        // แปลง Base64 data URL เป็น pure base64
        let base64Data = slipData;
        if (slipData.includes('base64,')) {
            base64Data = slipData.split('base64,')[1];
        }

        const payload = {
            image: base64Data,
            checkDuplicate: true  // ตรวจสอบ slip ซ้ำ
        };

        const response = await makeRequest('POST', '/verify', payload);
        
        // Handle duplicate slip (HTTP 400)
        if (response.status === 400 && response.data?.message === 'duplicate_slip') {
            return {
                success: false,
                error: 'สลิปนี้ถูกใช้งานแล้ว ไม่สามารถใช้ซ้ำได้',
                isDuplicate: true,
                raw: response.data
            };
        }
        
        if (response.status === 200 && response.data) {
            const data = response.data;
            
            // Thunder API response format
            if (data.status === 200 && data.data) {
                const slipInfo = data.data;
                return {
                    success: true,
                    amount: slipInfo.amount?.amount || 0,
                    transRef: slipInfo.transRef || '',
                    sendingBank: slipInfo.sender?.bank?.name || '',
                    receivingBank: slipInfo.receiver?.bank?.name || '',
                    senderName: slipInfo.sender?.account?.name?.th || slipInfo.sender?.account?.name?.en || '',
                    receiverName: slipInfo.receiver?.account?.name?.th || slipInfo.receiver?.account?.name?.en || '',
                    date: slipInfo.date || '',
                    raw: data
                };
            } else {
                return {
                    success: false,
                    error: data.message || 'ไม่สามารถตรวจสอบ Slip ได้',
                    raw: data
                };
            }
        } else {
            return {
                success: false,
                error: response.data?.message || `HTTP ${response.status}`,
                raw: response.data
            };
        }
    } catch (error) {
        console.error('verifySlip error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * ตรวจสอบ Slip ธนาคารด้วย Payload (อ่านจาก QR Code)
 * @param {string} payload - Payload ที่อ่านจาก QR Code บนสลิป
 * @param {boolean} checkDuplicate - ตรวจสอบ slip ซ้ำหรือไม่
 * @returns {Promise<Object>} ผลการตรวจสอบ
 */
async function verifySlipByPayload(payload, checkDuplicate = true) {
    try {
        if (!THUNDER_CONFIG.apiKey) {
            return {
                success: false,
                error: 'API Key not configured'
            };
        }

        // สร้าง query string
        let queryString = `payload=${encodeURIComponent(payload)}`;
        if (checkDuplicate) {
            queryString += '&checkDuplicate=true';
        }

        const response = await makeRequest('GET', `/verify?${queryString}`, null);
        
        // Handle duplicate slip (HTTP 400)
        if (response.status === 400 && response.data?.message === 'duplicate_slip') {
            return {
                success: false,
                error: 'สลิปนี้ถูกใช้งานแล้ว ไม่สามารถใช้ซ้ำได้',
                isDuplicate: true,
                raw: response.data
            };
        }
        
        if (response.status === 200 && response.data) {
            const data = response.data;
            
            // Thunder API response format
            if (data.status === 200 && data.data) {
                const slipInfo = data.data;
                return {
                    success: true,
                    amount: slipInfo.amount?.amount || 0,
                    transRef: slipInfo.transRef || '',
                    sendingBank: slipInfo.sender?.bank?.name || '',
                    receivingBank: slipInfo.receiver?.bank?.name || '',
                    senderName: slipInfo.sender?.account?.name?.th || slipInfo.sender?.account?.name?.en || '',
                    receiverName: slipInfo.receiver?.account?.name?.th || slipInfo.receiver?.account?.name?.en || '',
                    date: slipInfo.date || '',
                    raw: data
                };
            } else {
                return {
                    success: false,
                    error: data.message || 'ไม่สามารถตรวจสอบ Slip ได้',
                    raw: data
                };
            }
        } else {
            return {
                success: false,
                error: response.data?.message || `HTTP ${response.status}`,
                raw: response.data
            };
        }
    } catch (error) {
        console.error('verifySlipByPayload error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * สร้าง QR Code PromptPay (Local - ไม่ต้องใช้ API)
 * @param {number} amount - จำนวนเงิน
 * @param {string} promptPayId - PromptPay ID (เบอร์โทรหรือเลขบัตรประชาชน)
 * @param {string} ref - Reference สำหรับอ้างอิง
 * @returns {Promise<Object>} QR Code data
 */
async function generateQR(amount, promptPayId = null, ref = null) {
    try {
        const ppid = promptPayId || process.env.PROMPTPAY_ID;
        if (!ppid) {
            return {
                success: false,
                error: 'PromptPay ID not configured'
            };
        }

        // Validate amount
        if (amount < THUNDER_CONFIG.minAmount || amount > THUNDER_CONFIG.maxAmount) {
            return {
                success: false,
                error: `จำนวนเงินต้องอยู่ระหว่าง ${THUNDER_CONFIG.minAmount} - ${THUNDER_CONFIG.maxAmount} บาท`
            };
        }

        // สร้าง QR Code PromptPay ในระบบ (ไม่ต้องเรียก API)
        const qrResult = generatePromptPayQR(ppid, parseFloat(amount));
        
        if (!qrResult.success) {
            return qrResult;
        }

        const refId = ref || `DIPS-${Date.now()}`;

        return {
            success: true,
            qrCode: qrResult.qrCode,
            qrImage: null, // ใช้ external QR generator
            amount: amount,
            ref: refId,
            promptPayId: ppid,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 นาที
        };
    } catch (error) {
        console.error('generateQR error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * ตรวจสอบสถานะ API
 */
async function checkStatus() {
    try {
        const response = await makeRequest('GET', '/api/v1/status');
        return {
            success: response.status === 200,
            status: response.data
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * ตรวจสอบยอดเงินคงเหลือ (Credit)
 */
async function checkBalance() {
    try {
        if (!THUNDER_CONFIG.apiKey) {
            return {
                success: false,
                error: 'Thunder API Key not configured'
            };
        }

        const response = await makeRequest('GET', '/api/v1/balance');
        
        if (response.status === 200 && response.data) {
            return {
                success: true,
                balance: response.data.balance || response.data.credit || 0,
                raw: response.data
            };
        } else {
            return {
                success: false,
                error: response.data?.message || 'Failed to check balance'
            };
        }
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Check if Thunder API is enabled
 */
function isEnabled() {
    return process.env.THUNDER_TOPUP_ENABLED === 'true' && !!THUNDER_CONFIG.apiKey;
}

/**
 * Get config info (safe for frontend)
 */
function getConfig() {
    return {
        enabled: isEnabled(),
        minAmount: THUNDER_CONFIG.minAmount,
        maxAmount: THUNDER_CONFIG.maxAmount,
        hasPromptPayId: !!process.env.PROMPTPAY_ID
    };
}

module.exports = {
    verifySlip,
    verifySlipByPayload,
    generateQR,
    checkStatus,
    checkBalance,
    isEnabled,
    getConfig,
    THUNDER_CONFIG
};
