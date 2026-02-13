/**
 * Dips Hub - Discord Authentication Module
 * จัดการการ Login/Logout และแสดงข้อมูล User
 */

class DipsAuth {
    constructor() {
        this.user = null;
        this.isLoggedIn = false;
        this.init();
    }

    async init() {
        await this.checkLoginStatus();
        this.updateUI();
        this.bindEvents();
        
        // โหลด Wallet ถ้า login แล้ว
        if (this.isLoggedIn) {
            this.loadWallet();
        }
    }

    // โหลดข้อมูล Wallet
    async loadWallet() {
        try {
            const response = await fetch('/api/wallet');
            const data = await response.json();
            
            if (data.success) {
                this.updateBalanceUI(data.balance);
            }
        } catch (error) {
            console.log('Wallet load failed:', error);
        }
    }

    // อัพเดท UI แสดงยอดเงิน
    updateBalanceUI(balance) {
        const formatBalance = (amount) => {
            return new Intl.NumberFormat('th-TH', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(amount);
        };

        // อัพเดทใน dropdown
        const dropdownBalance = document.querySelector('.dropdown-balance-amount');
        if (dropdownBalance) {
            dropdownBalance.textContent = formatBalance(balance);
        }

        // อัพเดทใน navbar (ถ้ามี)
        const navBalance = document.querySelector('.nav-balance-amount');
        if (navBalance) {
            navBalance.textContent = formatBalance(balance);
        }
    }

    // ตรวจสอบสถานะ Login
    async checkLoginStatus() {
        try {
            const response = await fetch('/api/user');
            const data = await response.json();
            
            this.isLoggedIn = data.loggedIn;
            this.user = data.user;
            
            return data;
        } catch (error) {
            console.log('Auth check failed - server might not be running');
            this.isLoggedIn = false;
            this.user = null;
            return { loggedIn: false, user: null };
        }
    }

    // อัพเดท UI ตามสถานะ Login
    updateUI() {
        const userProfile = document.querySelector('.user-profile');
        const loginBtn = document.querySelector('.login-btn');
        const userDropdown = document.querySelector('.user-dropdown');
        
        if (this.isLoggedIn && this.user) {
            // แสดงข้อมูล User
            if (userProfile) {
                userProfile.innerHTML = `
                    <img src="${this.user.avatar}" alt="Avatar" class="user-avatar">
                    <span class="username">${this.user.username}</span>
                    <i class="fa-solid fa-caret-down"></i>
                `;
                userProfile.style.display = 'flex';
                userProfile.classList.add('logged-in');
            }
            
            // ซ่อนปุ่ม Login
            if (loginBtn) {
                loginBtn.style.display = 'none';
            }
            
            // สร้าง Dropdown Menu
            this.createUserDropdown();
            
        } else {
            // แสดงปุ่ม Login - ไป Discord โดยตรง
            if (userProfile) {
                userProfile.innerHTML = `
                    <a href="/auth/discord" class="login-btn-discord">
                        <i class="fa-brands fa-discord"></i>
                        <span>Login</span>
                    </a>
                `;
            }
        }
    }

    // สร้าง User Dropdown Menu
    createUserDropdown() {
        const userProfile = document.querySelector('.user-profile');
        if (!userProfile || !this.isLoggedIn) return;

        // ลบ dropdown เดิมถ้ามี
        const existingDropdown = document.querySelector('.auth-dropdown');
        if (existingDropdown) existingDropdown.remove();

        const dropdown = document.createElement('div');
        dropdown.className = 'auth-dropdown';
        dropdown.innerHTML = `
            <div class="dropdown-header">
                <img src="${this.user.avatar}" alt="Avatar">
                <div class="dropdown-user-info">
                    <span class="dropdown-username">${this.user.username}</span>
                    <span class="dropdown-email">${this.user.email || 'ไม่ได้ระบุ email'}</span>
                </div>
            </div>
            <div class="dropdown-balance">
                <div class="balance-label">
                    <i class="fa-solid fa-wallet"></i>
                    <span>ยอดเงินคงเหลือ</span>
                </div>
                <div class="balance-amount">
                    <span class="dropdown-balance-amount">0.00</span>
                    <span class="balance-currency">฿</span>
                </div>
            </div>
            <div class="dropdown-divider"></div>
            <a href="/pages/profile.html" class="dropdown-item">
                <i class="fa-solid fa-user"></i>
                <span>โปรไฟล์</span>
            </a>
            <a href="/pages/topup.html" class="dropdown-item">
                <i class="fa-solid fa-plus-circle"></i>
                <span>เติมเงิน</span>
            </a>
            <a href="/pages/transactions.html" class="dropdown-item">
                <i class="fa-solid fa-clock-rotate-left"></i>
                <span>ประวัติธุรกรรม</span>
            </a>
            <div class="dropdown-divider"></div>
            <a href="#" class="dropdown-item logout-btn">
                <i class="fa-solid fa-right-from-bracket"></i>
                <span>ออกจากระบบ</span>
            </a>
        `;

        userProfile.appendChild(dropdown);
        
        // Logout button click - ผูก event ตรงนี้เลย
        const logoutBtn = dropdown.querySelector('.logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.logout();
            });
        }
        
        // Toggle dropdown on click
        userProfile.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            dropdown.classList.remove('show');
        });
    }

    // ผูก Event Listeners
    bindEvents() {
        // ไม่ต้องทำอะไร - logout ผูกใน createUserDropdown แล้ว
    }

    // Logout
    async logout() {
        try {
            const response = await fetch('/api/logout', {
                method: 'POST'
            });
            
            if (response.ok) {
                this.isLoggedIn = false;
                this.user = null;
                window.location.href = '/';
            }
        } catch (error) {
            console.error('Logout failed:', error);
            // Fallback: redirect to logout route
            window.location.href = '/auth/logout';
        }
    }

    // Get current user
    getUser() {
        return this.user;
    }

    // Check if logged in
    isAuthenticated() {
        return this.isLoggedIn;
    }
}

// CSS Styles for Auth UI
const authStyles = document.createElement('style');
authStyles.textContent = `
    .user-profile {
        position: relative;
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        padding: 8px 15px;
        border-radius: 8px;
        transition: background 0.3s;
    }

    .user-profile:hover {
        background: rgba(94, 234, 212, 0.1);
    }

    .user-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 2px solid #14b8a6;
    }

    .username {
        color: #a7c4bc;
        font-size: 0.95rem;
    }

    .login-link {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 20px;
        background: #5865F2;
        border-radius: 8px;
        color: white;
        text-decoration: none;
        font-size: 0.9rem;
        transition: all 0.3s;
    }

    .login-link:hover {
        background: #4752C4;
        transform: translateY(-2px);
    }

    /* Login Button Discord Style */
    .login-btn-discord {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        background: rgba(40, 50, 60, 0.9);
        border-radius: 8px;
        color: white;
        text-decoration: none;
        font-size: 0.9rem;
        font-weight: 500;
        transition: all 0.3s;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .login-btn-discord i {
        font-size: 1.1rem;
        color: #5865F2;
    }

    .login-btn-discord:hover {
        background: rgba(50, 60, 75, 0.95);
        transform: translateY(-2px);
        box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
    }

    /* Dropdown Menu */
    .auth-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 10px;
        width: 280px;
        background: rgba(26, 47, 42, 0.98);
        border: 1px solid rgba(94, 234, 212, 0.2);
        border-radius: 12px;
        padding: 10px 0;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-10px);
        transition: all 0.3s ease;
        z-index: 1000;
        backdrop-filter: blur(20px);
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    }

    .auth-dropdown.show {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
    }

    .dropdown-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 15px 20px;
    }

    .dropdown-header img {
        width: 45px;
        height: 45px;
        border-radius: 50%;
        border: 2px solid #14b8a6;
    }

    .dropdown-user-info {
        display: flex;
        flex-direction: column;
    }

    .dropdown-username {
        color: white;
        font-weight: 600;
        font-size: 1rem;
    }

    .dropdown-email {
        color: #6b8a82;
        font-size: 0.8rem;
    }

    .dropdown-divider {
        height: 1px;
        background: rgba(94, 234, 212, 0.1);
        margin: 8px 0;
    }

    .dropdown-balance {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 20px;
        background: rgba(20, 184, 166, 0.1);
        margin: 8px 15px;
        border-radius: 10px;
        border: 1px solid rgba(20, 184, 166, 0.2);
    }

    .balance-label {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #6b8a82;
        font-size: 0.85rem;
    }

    .balance-label i {
        color: #14b8a6;
    }

    .balance-amount {
        display: flex;
        align-items: baseline;
        gap: 4px;
    }

    .dropdown-balance-amount {
        color: #5eead4;
        font-size: 1.2rem;
        font-weight: 700;
    }

    .balance-currency {
        color: #14b8a6;
        font-size: 0.9rem;
        font-weight: 600;
    }

    .dropdown-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 20px;
        color: #a7c4bc;
        text-decoration: none;
        font-size: 0.9rem;
        transition: all 0.2s;
    }

    .dropdown-item:hover {
        background: rgba(94, 234, 212, 0.1);
        color: #5eead4;
    }

    .dropdown-item i {
        width: 20px;
        text-align: center;
        color: #14b8a6;
    }

    #logoutBtn {
        color: #ef4444;
    }

    #logoutBtn i {
        color: #ef4444;
    }

    #logoutBtn:hover {
        background: rgba(239, 68, 68, 0.1);
    }
`;
document.head.appendChild(authStyles);

// Initialize Auth when DOM is ready
let dipsAuth;
document.addEventListener('DOMContentLoaded', () => {
    dipsAuth = new DipsAuth();
});

// Export for use in other scripts
window.DipsAuth = DipsAuth;
window.getAuth = () => dipsAuth;
