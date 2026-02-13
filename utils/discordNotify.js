/**
 * Discord Webhook Notification Service
 * แจ้งเตือน Admin ผ่าน Discord เมื่อมี Angpao Request ใหม่
 */

const https = require('https');

/**
 * ส่ง Webhook ไป Discord
 * @param {string} webhookUrl - Discord Webhook URL
 * @param {object} embed - Discord Embed object
 */
async function sendWebhook(webhookUrl, embed) {
    return new Promise((resolve, reject) => {
        if (!webhookUrl) {
            return reject(new Error('Discord Webhook URL not configured'));
        }

        try {
            const url = new URL(webhookUrl);
            const data = JSON.stringify({ embeds: [embed] });

            const options = {
                hostname: url.hostname,
                port: 443,
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ success: true });
                    } else {
                        reject(new Error(`Discord API error: ${res.statusCode}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(data);
            req.end();
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * แจ้งเตือน Angpao Request ใหม่
 * @param {object} request - Angpao request data
 */
async function notifyAngpaoRequest(request) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    
    if (!webhookUrl) {
        console.log('Discord Webhook URL not configured, skipping notification');
        return { success: false, error: 'Webhook not configured' };
    }

    const embed = {
        title: '🧧 Angpao Request ใหม่!',
        color: 0xED4245, // สีแดง
        fields: [
            {
                name: '👤 User',
                value: request.username || request.userId,
                inline: true
            },
            {
                name: '🆔 Request ID',
                value: request.requestId,
                inline: true
            },
            {
                name: '💰 จำนวนเงิน (คาดการณ์)',
                value: request.expectedAmount ? `${request.expectedAmount} บาท` : 'ไม่ระบุ',
                inline: true
            },
            {
                name: '🔗 ลิ้งซองอั่งเปา',
                value: `\`\`\`${request.voucherLink}\`\`\``
            },
            {
                name: '📋 วิธีดำเนินการ',
                value: '1. Copy ลิ้งด้านบน\n2. เปิด TrueMoney App\n3. วางลิ้งในเบราว์เซอร์หรือแอป\n4. รับซองอั่งเปา\n5. กลับมากด Approve ในระบบ'
            }
        ],
        footer: {
            text: 'DIPS SHOP - Angpao System'
        },
        timestamp: new Date().toISOString()
    };

    try {
        await sendWebhook(webhookUrl, embed);
        console.log('Discord notification sent for angpao request:', request.requestId);
        return { success: true };
    } catch (error) {
        console.error('Failed to send Discord notification:', error);
        return { success: false, error: error.message };
    }
}

/**
 * แจ้งเตือนเมื่อ Approve/Reject Angpao
 * @param {object} request - Request data
 * @param {string} action - 'approved' or 'rejected'
 * @param {number} amount - จำนวนเงินที่ได้รับ (กรณี approved)
 */
async function notifyAngpaoResult(request, action, amount = 0) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    
    if (!webhookUrl) return { success: false };

    const isApproved = action === 'approved';
    
    const embed = {
        title: isApproved ? '✅ Angpao Approved!' : '❌ Angpao Rejected',
        color: isApproved ? 0x57F287 : 0xED4245,
        fields: [
            {
                name: '👤 User',
                value: request.username || request.userId,
                inline: true
            },
            {
                name: '🆔 Request ID',
                value: request.requestId,
                inline: true
            }
        ],
        timestamp: new Date().toISOString()
    };

    if (isApproved && amount > 0) {
        embed.fields.push({
            name: '💰 จำนวนเงินที่เติม',
            value: `${amount.toLocaleString()} บาท`,
            inline: true
        });
    }

    if (request.adminNote) {
        embed.fields.push({
            name: '📝 หมายเหตุ',
            value: request.adminNote
        });
    }

    try {
        await sendWebhook(webhookUrl, embed);
        return { success: true };
    } catch (error) {
        console.error('Failed to send Discord result notification:', error);
        return { success: false, error: error.message };
    }
}

/**
 * ทดสอบ Webhook
 */
async function testWebhook() {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    
    if (!webhookUrl) {
        return { success: false, error: 'DISCORD_WEBHOOK_URL not configured' };
    }

    const embed = {
        title: '🔔 Test Notification',
        description: 'Discord Webhook ทำงานปกติ!',
        color: 0x5865F2,
        timestamp: new Date().toISOString()
    };

    try {
        await sendWebhook(webhookUrl, embed);
        return { success: true, message: 'Test notification sent!' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    notifyAngpaoRequest,
    notifyAngpaoResult,
    testWebhook
};
