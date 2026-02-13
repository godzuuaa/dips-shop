/**
 * Dips Hub - Wallet System
 * จัดการยอดเงินและ Transactions
 */

class DipsWallet {
    constructor() {
        this.balance = 0;
        this.transactions = [];
        this.isLoaded = false;
    }

    // โหลดข้อมูล Wallet
    async load() {
        try {
            const response = await fetch('/api/wallet');
            const data = await response.json();
            
            if (data.success) {
                this.balance = data.balance || 0;
                this.transactions = data.transactions || [];
                this.isLoaded = true;
                this.updateUI();
                return data;
            }
            return null;
        } catch (error) {
            console.log('Wallet load failed:', error);
            return null;
        }
    }

    // อัพเดท UI แสดงยอดเงิน
    updateUI() {
        // อัพเดทยอดใน Navbar
        const navBalance = document.querySelector('.nav-balance-amount');
        if (navBalance) {
            navBalance.textContent = this.formatBalance(this.balance);
        }

        // อัพเดทยอดใน Dropdown
        const dropdownBalance = document.querySelector('.dropdown-balance-amount');
        if (dropdownBalance) {
            dropdownBalance.textContent = this.formatBalance(this.balance);
        }

        // อัพเดทยอดในหน้า Topup
        const topupBalance = document.querySelector('.topup-current-balance');
        if (topupBalance) {
            topupBalance.textContent = this.formatBalance(this.balance);
        }

        // อัพเดทยอดในหน้า Profile
        const profileBalance = document.querySelector('.profile-balance');
        if (profileBalance) {
            profileBalance.textContent = this.formatBalance(this.balance);
        }
    }

    // Format ตัวเลขยอดเงิน
    formatBalance(amount) {
        return new Intl.NumberFormat('th-TH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    // เติมเงิน
    async topup(amount, method, details = {}) {
        try {
            const response = await fetch('/api/wallet/topup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amount: parseFloat(amount),
                    method: method,
                    details: details
                })
            });

            const data = await response.json();
            
            if (data.success) {
                this.balance = data.newBalance;
                this.updateUI();
                return { success: true, balance: data.newBalance, transaction: data.transaction };
            } else {
                return { success: false, error: data.error };
            }
        } catch (error) {
            console.error('Topup failed:', error);
            return { success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };
        }
    }

    // หักเงิน (ซื้อสินค้า)
    async deduct(amount, productId, productName) {
        try {
            const response = await fetch('/api/wallet/deduct', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amount: parseFloat(amount),
                    productId: productId,
                    productName: productName
                })
            });

            const data = await response.json();
            
            if (data.success) {
                this.balance = data.newBalance;
                this.updateUI();
                return { success: true, balance: data.newBalance, transaction: data.transaction };
            } else {
                return { success: false, error: data.error };
            }
        } catch (error) {
            console.error('Deduct failed:', error);
            return { success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };
        }
    }

    // ดึงประวัติธุรกรรม
    async getTransactions(limit = 10) {
        try {
            const response = await fetch(`/api/wallet/transactions?limit=${limit}`);
            const data = await response.json();
            
            if (data.success) {
                this.transactions = data.transactions;
                return data.transactions;
            }
            return [];
        } catch (error) {
            console.error('Get transactions failed:', error);
            return [];
        }
    }

    // ดึงยอดเงินปัจจุบัน
    getBalance() {
        return this.balance;
    }

    // ตรวจสอบว่ามียอดเงินพอหรือไม่
    canAfford(amount) {
        return this.balance >= amount;
    }
}

// สร้าง instance และ export
let dipsWallet = null;

// Initialize เมื่อ Auth พร้อม
async function initWallet() {
    // รอให้ auth โหลดก่อน
    const auth = window.getAuth ? window.getAuth() : null;
    
    if (auth && auth.isAuthenticated()) {
        dipsWallet = new DipsWallet();
        await dipsWallet.load();
    }
}

// เรียกเมื่อ DOM พร้อม
document.addEventListener('DOMContentLoaded', async () => {
    // รอสักครู่ให้ auth initialize ก่อน
    setTimeout(async () => {
        await initWallet();
    }, 500);
});

// Export
window.DipsWallet = DipsWallet;
window.getWallet = () => dipsWallet;
window.initWallet = initWallet;
