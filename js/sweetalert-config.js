// SweetAlert2 Configuration for Dips Hub
// Import this file after loading SweetAlert2 library

// Toast notification (top-right corner)
const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer)
        toast.addEventListener('mouseleave', Swal.resumeTimer)
    }
});

// Success Alert
function showSuccess(message, title = 'สำเร็จ!') {
    return Swal.fire({
        icon: 'success',
        title: title,
        text: message,
        confirmButtonColor: '#14b8a6',
        background: 'rgba(26, 47, 42, 0.98)',
        color: '#fff',
        confirmButtonText: 'ตกลง',
        customClass: {
            popup: 'dips-swal-popup'
        }
    });
}

// Error Alert
function showError(message, title = 'เกิดข้อผิดพลาด!') {
    return Swal.fire({
        icon: 'error',
        title: title,
        text: message,
        confirmButtonColor: '#ef4444',
        background: 'rgba(26, 47, 42, 0.98)',
        color: '#fff',
        confirmButtonText: 'ตกลง',
        customClass: {
            popup: 'dips-swal-popup'
        }
    });
}

// Warning Alert
function showWarning(message, title = 'คำเตือน!') {
    return Swal.fire({
        icon: 'warning',
        title: title,
        text: message,
        confirmButtonColor: '#eab308',
        background: 'rgba(26, 47, 42, 0.98)',
        color: '#fff',
        confirmButtonText: 'ตกลง',
        customClass: {
            popup: 'dips-swal-popup'
        }
    });
}

// Info Alert
function showInfo(message, title = 'ข้อมูล') {
    return Swal.fire({
        icon: 'info',
        title: title,
        text: message,
        confirmButtonColor: '#14b8a6',
        background: 'rgba(26, 47, 42, 0.98)',
        color: '#fff',
        confirmButtonText: 'ตกลง',
        customClass: {
            popup: 'dips-swal-popup'
        }
    });
}

// Confirm Dialog
function showConfirm(message, title = 'ยืนยันการทำรายการ?') {
    return Swal.fire({
        icon: 'question',
        title: title,
        text: message,
        showCancelButton: true,
        confirmButtonColor: '#14b8a6',
        cancelButtonColor: '#6b8a82',
        background: 'rgba(26, 47, 42, 0.98)',
        color: '#fff',
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก',
        customClass: {
            popup: 'dips-swal-popup'
        }
    });
}

// Toast Notification
function showToast(message, icon = 'success') {
    return Toast.fire({
        icon: icon,
        title: message
    });
}

// Loading Alert
function showLoading(title = 'กำลังดำเนินการ...', text = 'กรุณารอสักครู่') {
    return Swal.fire({
        title: title,
        text: text,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        background: 'rgba(26, 47, 42, 0.98)',
        color: '#fff',
        didOpen: () => {
            Swal.showLoading();
        },
        customClass: {
            popup: 'dips-swal-popup'
        }
    });
}

// Close all Swal dialogs
function closeSwal() {
    Swal.close();
}
