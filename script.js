const canvas = document.getElementById('starfield');
const ctx = canvas.getContext('2d');

let width, height;
let mouseX = 0;
let mouseY = 0;
let targetMouseX = 0;
let targetMouseY = 0;

let entities = []; // Unified entity list for sorting by depth if needed
let stars = [];
let planets = [];
let constellations = [];
let nebulas = [];
let shootingStars = [];

// Configuration
const numStars = 500;
const starSpeed = 0.2; // Base speed
const fov = 300; // Field of view for projection

// Expanded Palette
const colors = [
    { r: 255, g: 255, b: 255 }, // White
    { r: 45, g: 212, b: 191 },  // Cyan (Brand)
    { r: 139, g: 92, b: 246 },  // Purple (Brand)
    { r: 236, g: 72, b: 153 },  // Pink
    { r: 245, g: 158, b: 11 },  // Amber
    { r: 59, g: 130, b: 246 }   // Blue
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
        this.size = random(0.2, 1.5);
        
        // Color chance
        const c = Math.random() > 0.7 ? randomColor() : colors[0];
        this.color = `rgba(${c.r}, ${c.g}, ${c.b}`;
        this.opacity = random(0.4, 1);
    }

    update() {
        this.z -= starSpeed * 5;
        if (this.z < 1) {
            this.init();
            this.z = width; // Respawn at back
        }
    }

    draw() {
        // 3D Projection
        const scale = fov / (this.z + fov); // Standard perspective formula
        const x2d = this.x * scale + width / 2 + mouseX * scale;
        const y2d = this.y * scale + height / 2 + mouseY * scale;
        
        if (x2d < 0 || x2d > width || y2d < 0 || y2d > height) return;

        // Scale size by proximity
        const r = this.size * scale * 2;
        const alpha = this.opacity * (1 - this.z / width);

        ctx.beginPath();
        ctx.fillStyle = `${this.color}, ${alpha})`;
        ctx.arc(x2d, y2d, r, 0, Math.PI * 2);
        ctx.fill();
    }
}

class Planet {
    constructor() {
        this.reset();
        // Start some planets closer
        this.z = random(width * 0.5, width * 2); 
    }

    reset() {
        // Spawn far away
        this.x = random(-width * 2, width * 2);
        this.y = random(-height * 2, height * 2);
        this.z = width * 2; // Start very far
        this.radius = random(20, 60);
        const c = randomColor();
        this.color = c;
        this.hasRings = Math.random() > 0.5;
        this.angle = random(0, Math.PI * 2);
    }

    update() {
        this.z -= starSpeed * 2; // Planets move slower (parallax)
        if (this.z < 50) { // Don't get too close, looks pixelated/weird
            this.reset();
        }
    }

    draw() {
        const scale = fov / (this.z + fov);
        const x2d = this.x * scale + width / 2 + mouseX * scale;
        const y2d = this.y * scale + height / 2 + mouseY * scale;
        const r = this.radius * scale;

        if (x2d < -r || x2d > width + r || y2d < -r || y2d > height + r) return;

        // Planet Body Gradient
        const grad = ctx.createRadialGradient(x2d - r/3, y2d - r/3, r/5, x2d, y2d, r);
        grad.addColorStop(0, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, 1)`);
        grad.addColorStop(1, 'rgba(10, 10, 20, 1)');

        ctx.beginPath();
        ctx.fillStyle = grad;
        ctx.arc(x2d, y2d, r, 0, Math.PI * 2);
        ctx.fill();

        // Rings
        if (this.hasRings) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, 0.6)`;
            ctx.lineWidth = r * 0.2;
            // Ellipse for ring
            ctx.ellipse(x2d, y2d, r * 2, r * 0.6, this.angle, 0, Math.PI * 2);
            ctx.stroke();
        }
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
        // Generate a random shape of 3-6 stars
        const numPoints = Math.floor(random(3, 7));
        for(let i=0; i<numPoints; i++) {
            this.points.push({
                ox: random(-100, 100), // Offset X
                oy: random(-100, 100)  // Offset Y
            });
        }
        this.color = randomColor();
    }

    update() {
        this.z -= starSpeed * 5;
        if (this.z < 1) {
            this.reset();
        }
    }

    draw() {
        const scale = fov / (this.z + fov);
        const cx = this.x * scale + width / 2 + mouseX * scale;
        const cy = this.y * scale + height / 2 + mouseY * scale;
        const alpha = (1 - this.z / width);

        if (cx < -100 || cx > width + 100 || cy < -100 || cy > height + 100) return;

        ctx.strokeStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${alpha * 0.4})`;
        ctx.lineWidth = 1;
        ctx.beginPath();

        const projectedPoints = this.points.map(p => ({
            x: cx + p.ox * scale,
            y: cy + p.oy * scale
        }));

        // Connect points
        ctx.moveTo(projectedPoints[0].x, projectedPoints[0].y);
        for(let i=1; i<projectedPoints.length; i++) {
            ctx.lineTo(projectedPoints[i].x, projectedPoints[i].y);
        }
        // Close loop for network effect
        ctx.lineTo(projectedPoints[0].x, projectedPoints[0].y);
        
        // Connect random cross points for "tensor" density
        if (projectedPoints.length > 3) {
             ctx.moveTo(projectedPoints[0].x, projectedPoints[0].y);
             ctx.lineTo(projectedPoints[2].x, projectedPoints[2].y);
        }
        ctx.stroke();

        // Draw 'nodes' (stars) at points
        projectedPoints.forEach(p => {
            // Core
            ctx.beginPath();
            ctx.fillStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${alpha})`;
            ctx.arc(p.x, p.y, 3 * scale, 0, Math.PI * 2);
            ctx.fill();
            
            // Glow effect on nodes
            const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 8 * scale);
            glow.addColorStop(0, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${alpha * 0.4})`);
            glow.addColorStop(1, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, 0)`);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 8 * scale, 0, Math.PI * 2);
            ctx.fill();
        });
    }
}

class Nebula {
    constructor() {
        this.init();
    }

    init() {
        this.x = random(0, width);
        this.y = random(0, height);
        this.radius = random(width * 0.2, width * 0.5);
        const c = randomColor();
        this.rgb = `${c.r}, ${c.g}, ${c.b}`;
        this.vx = random(-0.1, 0.1);
        this.vy = random(-0.1, 0.1);
        this.opacity = 0;
        this.targetOpacity = random(0.05, 0.1); // Keep subtle
        this.fadeIn = true;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < -this.radius || this.x > width + this.radius) this.vx *= -1;
        if (this.y < -this.radius || this.y > height + this.radius) this.vy *= -1;

        if (this.fadeIn) {
            this.opacity += 0.0005;
            if (this.opacity >= this.targetOpacity) this.fadeIn = false;
        } else {
            this.opacity -= 0.0005;
            if (this.opacity <= 0) {
                this.fadeIn = true;
                this.init();
            }
        }
    }

    draw() {
        // Check if offscreen to save perf
        if (this.opacity <= 0) return;
        
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
        gradient.addColorStop(0, `rgba(${this.rgb}, ${this.opacity})`);
        gradient.addColorStop(1, `rgba(${this.rgb}, 0)`);

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }
}

class ShootingStar {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = random(0, width);
        this.y = random(0, height / 2);
        this.len = random(100, 300);
        this.speed = random(10, 25);
        this.size = random(0.5, 2);
        this.angle = random(Math.PI / 4, Math.PI / 3);
        this.active = false;
        this.waitTime = random(100, 600);
        const c = randomColor();
        this.color = `rgba(${c.r}, ${c.g}, ${c.b}`;
    }

    update() {
        if (this.active) {
            this.x += Math.cos(this.angle) * this.speed;
            this.y += Math.sin(this.angle) * this.speed;
            this.len -= this.speed * 0.4;

            if (this.x > width || this.y > height || this.len < 0) {
                this.active = false;
                this.reset();
            }
        } else {
            this.waitTime--;
            if (this.waitTime <= 0) this.active = true;
        }
    }

    draw() {
        if (!this.active) return;
        
        const tailX = this.x - Math.cos(this.angle) * this.len;
        const tailY = this.y - Math.sin(this.angle) * this.len;

        const gradient = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
        gradient.addColorStop(0, `${this.color}, 1)`);
        gradient.addColorStop(1, `${this.color}, 0)`);

        ctx.beginPath();
        ctx.strokeStyle = gradient;
        ctx.lineWidth = this.size;
        ctx.lineCap = 'round';
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
    }
}

// --- Engine ---

function init() {
    resize();
    
    stars = [];
    for (let i = 0; i < numStars; i++) stars.push(new Star());

    nebulas = [];
    for (let i = 0; i < 4; i++) nebulas.push(new Nebula());

    planets = [];
    for (let i = 0; i < 3; i++) planets.push(new Planet()); // Few planets

    constellations = [];
    for (let i = 0; i < 5; i++) constellations.push(new Constellation());

    shootingStars = [];
    for (let i = 0; i < 2; i++) shootingStars.push(new ShootingStar());

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

    // Smooth mouse movement
    mouseX += (targetMouseX - mouseX) * 0.1;
    mouseY += (targetMouseY - mouseY) * 0.1;

    // Layer 1: Nebulas (Background)
    ctx.globalCompositeOperation = 'screen';
    nebulas.forEach(n => { n.update(); n.draw(); });
    
    // Layer 2: Stars & Constellations & Planets (Sorted by Z for depth correctness)
    // Note: Simple painter's algo: draw furthest first
    // Merging lists for sorting is expensive every frame, so we layer by type roughly
    // or just accept some overlap quirkiness for performance.
    // Given sparse planets, explicit z-sorting isn't super critical but let's be clean.
    
    ctx.globalCompositeOperation = 'source-over';
    
    // Just draw constellations first (they are wireframes)
    constellations.forEach(c => { c.update(); c.draw(); });
    
    // Planets behind some stars, in front of others? 
    // Actually, since stars are points, drawing planets first is safer so stars don't get hidden behind transparent parts?
    // Let's just draw planets, then stars.
    planets.forEach(p => { p.update(); p.draw(); });
    stars.forEach(s => { s.update(); s.draw(); });

    // Layer 3: Shooting Stars (Foreground FX)
    ctx.globalCompositeOperation = 'lighter';
    shootingStars.forEach(s => { s.update(); s.draw(); });
    
    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(animate);
}

window.addEventListener('resize', resize);
window.addEventListener('mousemove', (e) => {
    targetMouseX = (e.clientX - width / 2) * 0.05; // Sensitivity
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
});

// --- UI Logic ---

function setupBackToTop() {
    const btn = document.getElementById('back-to-top');
    if (!btn) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 500) {
            btn.classList.add('visible');
        } else {
            btn.classList.remove('visible');
        }
    });

    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function setupActiveNav() {
    const sections = document.querySelectorAll('section');
    const navLinks = document.querySelectorAll('.nav-links a:not(.nav-cta)');
    
    if (!sections.length || !navLinks.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('id');
                if (!id) return;
                
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${id}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }, { threshold: 0.2, rootMargin: "-10% 0px -50% 0px" });

    sections.forEach(section => observer.observe(section));
}

function setupCardGlow() {
    const cards = document.querySelectorAll('.card, .role-card-detailed, .poster-card, .faq-item');
    
    cards.forEach(card => {
        card.addEventListener('mousemove', e => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });
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


// --- Site Logic (Preserved) ---

function filterProjects(category) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const e = window.event;
    if (e && e.target) {
         e.target.classList.add('active');
    }
    document.querySelectorAll('.project-card').forEach(card => {
        card.style.display = (category === 'all' || card.dataset.category === category) ? 'flex' : 'none';
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
        btn.onclick = function(e) {
            e.stopPropagation();
            window.open(src, '_blank');
        };
    }
}

function closeModal(e) {
    if (e.target.classList.contains('modal') || e.target.classList.contains('close-modal')) {
        document.getElementById("poster-modal").style.display = "none";
        const frame = document.getElementById("modal-frame");
        if (frame) frame.src = ""; // Clear source to stop loading/playing
    }
}

// --- New Interactive Features ---

function scrollTestimonials(direction) {
    const grid = document.querySelector('.testimonial-grid');
    if (grid) {
        const scrollAmount = 350 + 32; // card width + gap
        grid.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
    }
}

function setupStatsAnimation() {
    const stats = document.querySelectorAll('.stat-number');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = entry.target;
                const value = parseInt(target.innerText.replace('%', ''));
                if (!isNaN(value)) {
                    animateValue(target, 0, value, 2000);
                }
                observer.unobserve(target);
            }
        });
    }, { threshold: 0.5 });

    stats.forEach(stat => observer.observe(stat));
}

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const current = Math.floor(progress * (end - start) + start);
        obj.innerHTML = current + "%";
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = end + "%";
        }
    };
    window.requestAnimationFrame(step);
}
