// ====================================
// RovX Hub - Main JavaScript
// ====================================

// รอให้หน้าเว็บโหลดเสร็จ
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 RovX Hub พร้อมใช้งาน!');
    initNavbar();
    initCloseButton();
    initUserDropdown();
    initBuyButton();
});

// ====================================
// Navbar Active Link
// ====================================
function initNavbar() {
    const navLinks = document.querySelectorAll('.nav-links a');
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

// ====================================
// ปุ่มปิด Content Box
// ====================================
function initCloseButton() {
    const closeBtn = document.querySelector('.close-btn');
    const contentBox = document.querySelector('.content-box');
    
    if (closeBtn && contentBox) {
        closeBtn.addEventListener('click', function() {
            contentBox.style.opacity = '0';
            contentBox.style.transform = 'translateX(50px)';
            setTimeout(() => {
                contentBox.style.display = 'none';
            }, 300);
        });
    }
}

// ====================================
// User Dropdown Menu
// ====================================
// หมายเหตุ: ถ้า user login แล้ว จะใช้ dropdown จาก auth.js แทน
function initUserDropdown() {
    // ไม่ทำอะไร - ให้ auth.js จัดการ dropdown ทั้งหมด
    // เมื่อ user ยังไม่ login auth.js จะแสดงปุ่ม login แทน
}

// ====================================
// ปุ่มซื้อสินค้า
// ====================================
function initBuyButton() {
    const buyBtn = document.querySelector('.btn-buy');
    
    if (buyBtn) {
        buyBtn.addEventListener('click', function(e) {
            e.preventDefault();
            showNotification('กำลังไปหน้าร้านค้า...', 'info');
            setTimeout(() => {
                window.location.href = 'pages/store.html';
            }, 1000);
        });
    }
}

// ====================================
// Notification System
// ====================================
function showNotification(message, type = 'info') {
    const oldNotif = document.querySelector('.notification');
    if (oldNotif) oldNotif.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-times-circle';
    
    notification.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 100);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ====================================
// Loading Functions
// ====================================
function showLoading() {
    const loader = document.createElement('div');
    loader.className = 'loading-overlay';
    loader.innerHTML = `
        <div class="loader">
            <i class="fa-solid fa-gear fa-spin"></i>
            <p>กำลังโหลด...</p>
        </div>
    `;
    document.body.appendChild(loader);
}

function hideLoading() {
    const loader = document.querySelector('.loading-overlay');
    if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => loader.remove(), 300);
    }
}

// ====================================
// Logout
// ====================================
function logout() {
    showNotification('กำลังออกจากระบบ...', 'info');
    setTimeout(() => {
        window.location.href = 'pages/login.html';
    }, 1500);
}
