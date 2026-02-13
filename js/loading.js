/* ====================================
   Dips Hub - Loading Screen Script
   ==================================== */

// ตรวจสอบว่าควรแสดง Loading หรือไม่
function shouldShowLoading() {
    // ดึงข้อมูล navigation type
    const navEntries = performance.getEntriesByType('navigation');
    const navType = navEntries.length > 0 ? navEntries[0].type : 'navigate';
    
    // ถ้า refresh (reload) → แสดง loading ทุกหน้า
    if (navType === 'reload') {
        return true;
    }
    
    // ตรวจสอบว่าอยู่หน้า index.html หรือไม่
    const currentPath = window.location.pathname;
    const isIndexPage = currentPath === '/' || 
                        currentPath === '/index.html' || 
                        currentPath.endsWith('/index.html') ||
                        currentPath === '/DIPS%20SHOP/index.html';
    
    // ถ้าอยู่หน้า index.html → แสดง loading
    if (isIndexPage) {
        return true;
    }
    
    // หน้าอื่นๆ ไม่แสดง loading (ยกเว้น refresh)
    return false;
}

// สร้าง Loading Screen
function createLoadingScreen() {
    // ถ้าไม่ควรแสดง loading ก็ไม่ต้องสร้าง
    if (!shouldShowLoading()) {
        return;
    }

    // ตรวจสอบว่า body พร้อมหรือยัง
    if (!document.body) {
        // ถ้า body ยังไม่พร้อม ให้รอ
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createLoadingScreen);
        }
        return;
    }

    // ตรวจสอบว่ามี loading screen อยู่แล้วหรือไม่
    if (document.getElementById('loadingScreen')) {
        return;
    }
    
    const loadingHTML = `
        <div class="loading-screen" id="loadingScreen">
            <div class="infinity-loader">
                <svg viewBox="0 0 100 50">
                    <path d="M25,25 C25,10 10,10 10,25 C10,40 25,40 25,25 C25,10 40,10 50,25 C60,40 75,40 75,25 C75,10 90,10 90,25 C90,40 75,40 75,25 C75,10 60,10 50,25 C40,40 25,40 25,25" />
                </svg>
            </div>
            <div class="loading-logo">
                <span class="dips">DIPS</span><span class="hub">HUB</span>
            </div>
            <div class="loading-progress">
                <div class="loading-progress-bar"></div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('afterbegin', loadingHTML);
}

// ซ่อน Loading Screen เมื่อโหลดเสร็จ
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.add('hide');
        
        // ลบออกหลังจาก animation เสร็จ (300ms)
        setTimeout(() => {
            loadingScreen.remove();
        }, 300);
    }
}

// เริ่มต้น
document.addEventListener('DOMContentLoaded', function() {
    // รอให้ทุกอย่างโหลดเสร็จ
    if (document.readyState === 'complete') {
        setTimeout(hideLoadingScreen, 800);
    } else {
        window.addEventListener('load', function() {
            setTimeout(hideLoadingScreen, 800);
        });
    }
});

// สร้าง loading ทันทีที่ script โหลด
createLoadingScreen();
