// Header scroll effect
window.addEventListener('scroll', () => {
    const header = document.getElementById('header');
    if (window.scrollY > 20) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
});

// Mobile menu toggle
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const navMenu = document.getElementById('nav-menu');

mobileMenuBtn.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    const icon = mobileMenuBtn.querySelector('i');
    if (navMenu.classList.contains('active')) {
        icon.className = 'fas fa-times';
    } else {
        icon.className = 'fas fa-bars';
    }
});

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Dynamic stats animation
const stats = [
    { number: "50,000+", label: "Presentes Encontrados", icon: "fas fa-gift" },
    { number: "98.7%", label: "Taxa de Satisfação", icon: "fas fa-heart" },
    { number: "2.3min", label: "Tempo Médio", icon: "fas fa-clock" },
    { number: "15,000+", label: "Clientes Felizes", icon: "fas fa-users" }
];

let currentStatIndex = 0;

function updateStats() {
    const statItems = document.querySelectorAll('.stat-item');
    
    // Remove active class from all items
    statItems.forEach(item => item.classList.remove('active'));
    
    // Add active class to current item
    if (statItems[currentStatIndex]) {
        statItems[currentStatIndex].classList.add('active');
    }
    
    // Move to next stat
    currentStatIndex = (currentStatIndex + 1) % stats.length;
}

// Start stats animation
setInterval(updateStats, 3000);

// Newsletter form
const newsletterForm = document.getElementById('newsletter-form');
if (newsletterForm) {
    newsletterForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const email = this.querySelector('input[type="email"]').value;
        
        // Simulate API call
        const button = this.querySelector('button');
        const originalText = button.textContent;
        button.textContent = 'Inscrevendo...';
        button.disabled = true;
        
        setTimeout(() => {
            button.textContent = 'Inscrito!';
            button.style.background = '#10b981';
            
            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
                button.style.background = '';
                this.reset();
            }, 2000);
        }, 1500);
    });
}

// Demo modal function
function showDemo() {
    alert('Demo em desenvolvimento! Em breve você poderá ver como nossa IA funciona na prática.');
}

// Intersection Observer for animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe elements for animation
document.addEventListener('DOMContentLoaded', () => {
    const animatedElements = document.querySelectorAll('.step-card, .feature-card, .pricing-card');
    
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});

// Get URL parameters
function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    const results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// Highlight selected plan if coming from pricing
document.addEventListener('DOMContentLoaded', () => {
    const selectedPlan = getUrlParameter('plan');
    if (selectedPlan) {
        const planCards = document.querySelectorAll('.pricing-card');
        planCards.forEach(card => {
            if (card.querySelector('.pricing-title').textContent.toLowerCase().includes(selectedPlan)) {
                card.style.border = '3px solid #8b5cf6';
                card.style.boxShadow = '0 0 30px rgba(139, 92, 246, 0.3)';
            }
        });
    }
});

// Loading states for buttons
document.querySelectorAll('.btn').forEach(btn => {
    if (btn.href && (btn.href.includes('questionario') || btn.href.includes('login'))) {
        btn.addEventListener('click', function(e) {
            if (!this.classList.contains('loading')) {
                this.classList.add('loading');
                const originalText = this.innerHTML;
                this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
                
                // Reset after 3 seconds if page doesn't change
                setTimeout(() => {
                    this.classList.remove('loading');
                    this.innerHTML = originalText;
                }, 3000);
            }
        });
    }
});

// Add loading styles
const style = document.createElement('style');
style.textContent = `
    .btn.loading {
        pointer-events: none;
        opacity: 0.7;
    }
    
    @media (max-width: 1024px) {
        .nav-menu.active {
            display: flex;
            flex-direction: column;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(20px);
            border-radius: 0 0 16px 16px;
            padding: 20px;
            gap: 16px;
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
            z-index: 1000;
        }
        
        .nav-menu.active .nav-link {
            padding: 12px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .nav-menu.active .nav-link:last-child {
            border-bottom: none;
        }
    }
`;
document.head.appendChild(style);