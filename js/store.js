// ====================================
// RovX Hub - Store JavaScript
// ====================================

document.addEventListener('DOMContentLoaded', function() {
    initCategoryTabs();
    initAddToCart();
});

// ====================================
// Category Filter
// ====================================
function initCategoryTabs() {
    const tabs = document.querySelectorAll('.category-tab');
    const products = document.querySelectorAll('.product-card');

    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // Remove active from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            const category = this.dataset.category;

            // Filter products
            products.forEach(product => {
                if (category === 'all' || product.dataset.category === category) {
                    product.style.display = 'block';
                    product.style.animation = 'fadeIn 0.3s ease';
                } else {
                    product.style.display = 'none';
                }
            });
        });
    });
}

// ====================================
// Add to Cart
// ====================================
function initAddToCart() {
    const addButtons = document.querySelectorAll('.btn-add-cart:not([disabled])');

    addButtons.forEach(button => {
        button.addEventListener('click', function() {
            const card = this.closest('.product-card');
            const title = card.querySelector('.product-title').textContent;
            const price = card.querySelector('.product-price').textContent;

            // Add to cart logic here
            addToCart({
                title: title,
                price: price
            });

            showNotification(`เพิ่ม "${title}" ลงตะกร้าแล้ว!`, 'success');

            // Button animation
            this.innerHTML = '<i class="fa-solid fa-check"></i> เพิ่มแล้ว';
            this.style.background = '#22c55e';

            setTimeout(() => {
                this.innerHTML = 'เพิ่มลงตะกร้า';
                this.style.background = '';
            }, 2000);
        });
    });
}

// ====================================
// Cart Functions
// ====================================
let cart = [];

function addToCart(item) {
    cart.push(item);
    updateCartCount();
    saveCart();
}

function updateCartCount() {
    // Update cart count in navbar if exists
    const cartCount = document.querySelector('.cart-count');
    if (cartCount) {
        cartCount.textContent = cart.length;
    }
}

function saveCart() {
    localStorage.setItem('rovx_cart', JSON.stringify(cart));
}

function loadCart() {
    const saved = localStorage.getItem('rovx_cart');
    if (saved) {
        cart = JSON.parse(saved);
        updateCartCount();
    }
}

// Load cart on page load
loadCart();

// ====================================
// Animations
// ====================================
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`;
document.head.appendChild(style);
