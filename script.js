const canvas = document.getElementById('starfield');
const ctx = canvas.getContext('2d');

let width, height;
let mouseX = 0;
let mouseY = 0;
let targetMouseX = 0;
let targetMouseY = 0;

let stars = [];
let planets = [];
let constellations = [];
let nebulas = [];
let shootingStars = [];

// Configuration - Performance Optimized
const numStars = 200; // Reduced from 300 for cleaner look
const starSpeed = 0.02; // Much slower for professional feel
const fov = 400;

// Palette - Muted & Professional
const colors = [
    { r: 255, g: 255, b: 255 }, // White
    { r: 45, g: 212, b: 191 },  // Cyan (Brand) - Muted
    { r: 167, g: 139, b: 250 }, // Soft Purple (Brand) - Muted
    { r: 148, g: 163, b: 184 }, // Slate-400 (Greyish Blue)
    { r: 56, g: 189, b: 248 }   // Sky Blue
];

const random = (min, max) => Math.random() * (max - min) + min;
const randomColor = () => colors[Math.floor(random(0, colors.length))];

// --- Classes ---

class Star {
    constructor() {
        this.init();
    }

    init() {
        this.x = random(-width, width);
        this.y = random(-height, height);
        this.z = random(0, width);
        this.size = random(0.5, 2.5); // Larger stars

        const c = Math.random() > 0.7 ? randomColor() : colors[0]; // More colored stars
        this.rgb = `${c.r}, ${c.g}, ${c.b}`;
        this.opacity = random(0.5, 1.0); // Brighter

        this.twinkleOffset = Math.random() * 1000;
        this.twinkleSpeed = random(0.005, 0.015); // Faster twinkle
    }

    update() {
        this.z -= starSpeed * 10; // Much faster movement
        if (this.z < 1) {
            this.init();
            this.z = width;
        }
    }

    draw() {
        const scale = fov / (this.z + fov);
        const x2d = this.x * scale + width / 2 + mouseX * scale;
        const y2d = this.y * scale + height / 2 + mouseY * scale;

        if (x2d < 0 || x2d > width || y2d < 0 || y2d > height) return;

        const r = this.size * scale * 2;
        const depthRatio = this.z / width;
        let alpha = this.opacity * (1 - depthRatio * depthRatio);

        const twinkle = Math.sin(Date.now() * this.twinkleSpeed + this.twinkleOffset) * 0.3 + 0.7;
        alpha *= twinkle;

        if (this.z < 100) alpha *= (this.z / 100);

        ctx.beginPath();
        ctx.fillStyle = `rgba(${this.rgb}, ${alpha})`;
        // Optimization: Removed shadowBlur for performance
        // ctx.shadowBlur = r * 2; 
        // ctx.shadowColor = `rgba(${this.rgb}, ${alpha})`;
        ctx.arc(x2d, y2d, r, 0, Math.PI * 2);
        ctx.fill();
        // ctx.shadowBlur = 0;
    }
}

class Constellation {
    constructor() {
        this.reset();
        this.z = random(0, width);
    }

    reset() {
        this.x = random(-width, width);
        this.y = random(-height, height);
        this.z = width;
        this.points = [];
        const numPoints = Math.floor(random(3, 6));
        for (let i = 0; i < numPoints; i++) {
            this.points.push({
                ox: random(-150, 150),
                oy: random(-150, 150)
            });
        }
        this.color = randomColor();
    }

    update() {
        this.z -= starSpeed * 10;
        if (this.z < 1) {
            this.reset();
        }
    }

    draw() {
        const scale = fov / (this.z + fov);
        const cx = this.x * scale + width / 2 + mouseX * scale;
        const cy = this.y * scale + height / 2 + mouseY * scale;

        const depthRatio = this.z / width;
        let alpha = (1 - depthRatio * depthRatio) * 0.8; // More visible

        if (this.z < 100) alpha *= (this.z / 100);

        if (cx < -200 || cx > width + 200 || cy < -200 || cy > height + 200) return;

        ctx.strokeStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${alpha * 0.4})`;
        ctx.lineWidth = 0.5; // Thinner lines
        ctx.beginPath();

        const projectedPoints = this.points.map(p => ({
            x: cx + p.ox * scale,
            y: cy + p.oy * scale
        }));

        ctx.moveTo(projectedPoints[0].x, projectedPoints[0].y);
        for (let i = 1; i < projectedPoints.length; i++) {
            ctx.lineTo(projectedPoints[i].x, projectedPoints[i].y);
        }
        ctx.lineTo(projectedPoints[0].x, projectedPoints[0].y);

        if (projectedPoints.length > 3) {
            ctx.moveTo(projectedPoints[0].x, projectedPoints[0].y);
            ctx.lineTo(projectedPoints[2].x, projectedPoints[2].y);
        }
        ctx.stroke();

        projectedPoints.forEach(p => {
            ctx.beginPath();
            ctx.fillStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${alpha})`;
            ctx.arc(p.x, p.y, 1.5 * scale, 0, Math.PI * 2); // Smaller nodes
            ctx.fill();

            // Removed Node Glow for cleaner look
        });
    }
}

// --- Engine ---

function init() {
    resize();

    stars = [];
    for (let i = 0; i < numStars; i++) stars.push(new Star());

    constellations = [];
    for (let i = 0; i < 5; i++) constellations.push(new Constellation()); // More constellations

    animate();
}

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
}

function animate() {
    ctx.clearRect(0, 0, width, height);

    mouseX += (targetMouseX - mouseX) * 0.1;
    mouseY += (targetMouseY - mouseY) * 0.1;

    // Draw constellations
    constellations.forEach(c => { c.update(); c.draw(); });

    // Draw stars
    stars.forEach(s => { s.update(); s.draw(); });

    requestAnimationFrame(animate);
}

window.addEventListener('resize', resize);
window.addEventListener('mousemove', (e) => {
    targetMouseX = (e.clientX - width / 2) * 0.05;
    targetMouseY = (e.clientY - height / 2) * 0.05;
});

document.addEventListener('DOMContentLoaded', () => {
    init();
    setupMobileMenu();
    setupScrollAnimations();
    setupStatsAnimation();
    setupCardGlow();
    setupBackToTop();
    setupActiveNav();
    setupBackgroundTransition();
});

function setupBackgroundTransition() {
    const triggerSection = document.getElementById('open-roles');
    const pillarsBg = document.querySelector('.starfield-overlay');
    const orionBg = document.querySelector('.parallax-bg');

    if (!triggerSection || !pillarsBg || !orionBg) return;

    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const rect = triggerSection.getBoundingClientRect();
                const viewHeight = window.innerHeight;

                // Trigger when the section is entering the viewport (e.g. top is within view)
                // Adjust threshold as needed. Here: when top is in the bottom 20% of screen or higher.
                if (rect.top < viewHeight * 0.8) {
                    pillarsBg.classList.add('bg-hidden');
                    orionBg.classList.add('bg-visible');
                } else {
                    pillarsBg.classList.remove('bg-hidden');
                    orionBg.classList.remove('bg-visible');
                }
                ticking = false;
            });
            ticking = true;
        }
    });
}

// --- UI Logic ---

function setupBackToTop() {
    const btn = document.getElementById('back-to-top');
    if (!btn) return;

    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                if (window.scrollY > 500) {
                    btn.classList.add('visible');
                } else {
                    btn.classList.remove('visible');
                }
                ticking = false;
            });
            ticking = true;
        }
    });

    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function setupActiveNav() {
    const header = document.querySelector('header');
    const sections = document.querySelectorAll('section');
    const navLinks = document.querySelectorAll('.nav-links a:not(.nav-cta)');

    // Header scroll effect
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    // Active link highlighting
    // Active link highlighting
    if (!sections.length || !navLinks.length) return;

    const highlightNav = () => {
        let current = '';
        const viewHeight = window.innerHeight;

        sections.forEach(section => {
            const rect = section.getBoundingClientRect();
            // Using 30% view height offset to trigger active state slightly before section hits top
            if (rect.top <= viewHeight * 0.3 && rect.bottom >= 100) {
                current = section.getAttribute('id');
            }
        });

        // Mapping for grouped sections
        // key: section ID that should trigger the nav link
        // value: the href of the nav link to activate
        const sectionStartToNavHref = {
            'approach': 'roles',        // "Timeline" section keeps "The Approach" (#roles) active
            'testimonials': 'marketplace' // "Fellow Stories" section keeps "2025 Cohort" (#marketplace) active
        };

        navLinks.forEach(link => {
            // Only manage active state for hash links (scroll spy)
            const href = link.getAttribute('href');
            if (href && href.startsWith('#')) {
                link.classList.remove('active');

                // Determine the target ID to match against
                // If the current section is part of a group, map it to the primary nav link ID
                let targetId = current;
                if (sectionStartToNavHref[current]) {
                    targetId = sectionStartToNavHref[current];
                }

                if (href === `#${targetId}`) {
                    link.classList.add('active');
                }
            }
        });
    };

    window.addEventListener('scroll', highlightNav);
    highlightNav(); // Initial check
}

function setupCardGlow() {
    const cards = document.querySelectorAll('.card, .role-card-detailed, .poster-card, .faq-item, .btn'); // Added .btn for liquid effect

    // Mouse Tracking (Desktop)
    window.addEventListener('mousemove', e => {
        const x = e.clientX;
        const y = e.clientY;

        // Use a single RAF loop for better performance than per-card listeners
        window.requestAnimationFrame(() => {
            cards.forEach(card => {
                const rect = card.getBoundingClientRect();
                const cardX = x - rect.left;
                const cardY = y - rect.top;
                card.style.setProperty('--mouse-x', `${cardX}px`);
                card.style.setProperty('--mouse-y', `${cardY}px`);
            });
        });
    });

    // Accelerometer Tracking (Mobile "Virtual Light")
    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', e => {
            // Convert tilt (beta/gamma) to a simulated light position
            // Beta: -180 to 180 (front/back tilt)
            // Gamma: -90 to 90 (left/right tilt)

            // Normalize tilt to a shift range (e.g., +/- 100px)
            const shiftX = (e.gamma || 0) * 5;
            const shiftY = (e.beta || 0) * 5;

            window.requestAnimationFrame(() => {
                cards.forEach(card => {
                    const rect = card.getBoundingClientRect();
                    // Center of card
                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;

                    // Apply tilt offset to the center light source
                    card.style.setProperty('--mouse-x', `${centerX + shiftX}px`);
                    card.style.setProperty('--mouse-y', `${centerY + shiftY}px`);
                });
            });
        });
    }
}

function setupMobileMenu() {
    const btn = document.querySelector('.mobile-menu-btn');
    const nav = document.querySelector('.nav-links');
    const links = document.querySelectorAll('.nav-links a');

    if (btn && nav) {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            nav.classList.toggle('active');
            document.body.style.overflow = nav.classList.contains('active') ? 'hidden' : '';
        });

        links.forEach(link => {
            link.addEventListener('click', () => {
                btn.classList.remove('active');
                nav.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
    }
}

function setupScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('section h2, .card, .role-card-detailed, .poster-card, .timeline-item, .stats-bar').forEach(el => {
        el.classList.add('scroll-hidden');
        observer.observe(el);
    });
}

function openModal(src, title) {
    const m = document.getElementById("poster-modal");
    m.style.display = "flex";
    const frame = document.getElementById("modal-frame");
    if (frame) frame.src = src;
    document.getElementById("modal-caption").innerText = title;

    const btn = document.getElementById("download-btn");
    if (btn) {
        btn.onclick = function (e) {
            e.stopPropagation();
            window.open(src, '_blank');
        };
    }
}

function closeModal(e) {
    if (e.target.classList.contains('modal') || e.target.classList.contains('close-modal')) {
        document.getElementById("poster-modal").style.display = "none";
        const frame = document.getElementById("modal-frame");
        if (frame) frame.src = "";
    }
}

function setupStatsAnimation() {
    const stats = document.querySelectorAll('.stat-number');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = entry.target;
                const finalValue = parseInt(target.getAttribute('data-value'));
                const hasPercent = target.innerText.includes('%');

                if (!isNaN(finalValue)) {
                    animateValue(target, 0, finalValue, 2000, hasPercent);
                }
                observer.unobserve(target);
            }
        });
    }, { threshold: 0.5 });

    stats.forEach(stat => observer.observe(stat));
}

function animateValue(obj, start, end, duration, hasPercent) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const current = Math.floor(progress * (end - start) + start);
        obj.innerHTML = current + (hasPercent ? "%" : "");
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = end + (hasPercent ? "%" : "");
        }
    };
    window.requestAnimationFrame(step);
}

function filterProjects(category) {
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick').includes(`'${category}'`)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const cards = document.querySelectorAll('.project-card');
    cards.forEach(card => {
        const cardCategory = card.getAttribute('data-category');
        if (category === 'all' || cardCategory === category) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

function filterFAQ(category) {
    const buttons = document.querySelectorAll('#faq .filter-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick').includes(`'${category}'`)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const items = document.querySelectorAll('.faq-item');
    items.forEach(item => {
        const itemCategory = item.getAttribute('data-category');
        if (category === 'all' || itemCategory === category || itemCategory === 'all') {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
            item.removeAttribute('open'); // Close if hidden
        }
    });
}
