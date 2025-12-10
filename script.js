document.addEventListener('DOMContentLoaded', () => {
    setupMobileMenu();
    setupSmoothScroll();
    setupActiveNav();
    // Filter functions are global for onclick handlers
});

function setupMobileMenu() {
    const btn = document.querySelector('.mobile-menu-btn');
    const nav = document.querySelector('.nav-links');

    if (!btn || !nav) return;

    btn.addEventListener('click', () => {
        const isHidden = getComputedStyle(nav).display === 'none';
        if (isHidden) {
            nav.style.display = 'flex';
            nav.style.flexDirection = 'column';
            nav.style.position = 'absolute';
            nav.style.top = '100%';
            nav.style.left = '0';
            nav.style.width = '100%';
            nav.style.background = 'white';
            nav.style.padding = '1rem';
            nav.style.borderBottom = '1px solid #e2e8f0';
            nav.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
        } else {
            nav.style.display = 'none';
            // Clean up inline styles so desktop layout works on resize
            nav.removeAttribute('style');
        }
    });

    // Reset on resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            nav.removeAttribute('style');
        }
    });
}

function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const target = document.getElementById(targetId);

            if (target) {
                // Offset for sticky header
                const headerOffset = 80;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: "smooth"
                });

                // Update active state manually
                document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
                this.classList.add('active');
            }
        });
    });
}

function setupActiveNav() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-links a');

    // Grouping mapping (same logic as before, just cleaner)
    const sectionStartToNavHref = {
        'approach': 'roles',        // Timeline -> The Approach
        'testimonials': 'marketplace' // Fellow Stories -> 2025 Cohort
    };

    window.addEventListener('scroll', () => {
        let current = '';
        const viewHeight = window.innerHeight;
        const headerOffset = 100;

        sections.forEach(section => {
            const rect = section.getBoundingClientRect();
            // Check if section is effectively in view (near top, accounting for header)
            if (rect.top <= headerOffset + 50 && rect.bottom >= headerOffset) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href && href.startsWith('#')) {
                link.classList.remove('active');

                let targetId = current;
                if (sectionStartToNavHref[current]) {
                    targetId = sectionStartToNavHref[current]; // Map grouped sections
                }

                if (href === `#${targetId}`) {
                    link.classList.add('active');
                }
            }
        });
    });
}

// Global Filter Functions (Needs to be on window for HTML onclicks)
window.filterProjects = function (category) {
    const cards = document.querySelectorAll('.project-card');
    const buttons = document.querySelectorAll('#marketplace .filter-btn'); // specific to marketplace

    // Update buttons (Simple visual toggle logic, assumes styles exist)
    if (buttons.length) {
        buttons.forEach(btn => btn.style.backgroundColor = 'transparent');
        buttons.forEach(btn => btn.style.border = '1px solid #e2e8f0');
        // Logic to highlight active button would go here if we kept the precise class structure
        // For now, functionality first:
    }

    cards.forEach(card => {
        if (category === 'all' || card.dataset.category === category) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

window.filterFAQ = function (category) {
    const items = document.querySelectorAll('.faq-item');
    items.forEach(item => {
        if (category === 'all' || item.dataset.category === category) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}
