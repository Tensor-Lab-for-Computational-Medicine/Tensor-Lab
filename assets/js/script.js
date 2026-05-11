document.addEventListener('DOMContentLoaded', () => {
    setupSmoothScroll();
    setupActiveNav();
    setupMobileMenu();
    setupLegalBanner();
});

/* ── Legal Notice Banner ── */
function setupLegalBanner() {
    if (localStorage.getItem('tl_legal_ack') === '1') return;

    const banner = document.createElement('div');
    banner.id = 'legal-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Legal notice');
    banner.innerHTML = `
        <div class="legal-banner-inner">
            <p>By using this website or submitting an application you agree to our
                <a href="/terms.html">Terms&nbsp;of&nbsp;Use&nbsp;&amp;&nbsp;Disclaimer</a> and
                <a href="/privacy.html">Privacy&nbsp;Policy</a>.
                This site is for informational and educational purposes only and does not provide medical advice.</p>
            <button id="legal-banner-accept" type="button">I Understand</button>
        </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        #legal-banner {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 9999;
            background: rgba(10, 10, 10, 0.97);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-top: 1px solid rgba(255,255,255,0.12);
            padding: 1.25rem 2rem;
            animation: legalSlideUp 0.4s ease-out;
        }
        @keyframes legalSlideUp {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
        }
        .legal-banner-inner {
            max-width: 960px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            gap: 1.5rem;
            flex-wrap: wrap;
        }
        #legal-banner p {
            flex: 1;
            min-width: 260px;
            font-family: 'Inter', sans-serif;
            font-size: 0.8rem;
            line-height: 1.5;
            color: rgba(255,255,255,0.7);
            margin: 0;
        }
        #legal-banner a {
            color: #dc2626;
            text-decoration: underline;
            text-underline-offset: 2px;
        }
        #legal-banner-accept {
            flex-shrink: 0;
            font-family: 'Inter', sans-serif;
            font-size: 0.8rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            padding: 0.65rem 1.5rem;
            border: 1px solid rgba(255,255,255,0.25);
            border-radius: 4px;
            background: transparent;
            color: #fff;
            cursor: pointer;
            transition: all 0.2s;
        }
        #legal-banner-accept:hover {
            background: #dc2626;
            border-color: #dc2626;
        }
    `;

    document.head.appendChild(style);
    document.body.appendChild(banner);

    document.getElementById('legal-banner-accept').addEventListener('click', () => {
        localStorage.setItem('tl_legal_ack', '1');
        banner.style.animation = 'none';
        banner.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        banner.style.transform = 'translateY(100%)';
        banner.style.opacity = '0';
        setTimeout(() => banner.remove(), 350);
    });
}

function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const target = document.getElementById(targetId);

            if (target) {
                // No header offset needed in split-screen (0), but maybe small padding
                const offsetPosition = target.getBoundingClientRect().top + window.pageYOffset - 20;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: "smooth"
                });
            }
        });
    });
}

function setupActiveNav() {
    const sections = document.querySelectorAll('.journal-section');
    const navLinks = document.querySelectorAll('.journal-nav .nav-item');

    window.addEventListener('scroll', () => {
        let current = '';

        // Use a threshold (e.g. 1/3 down the screen) to trigger active state
        const triggerPoint = window.innerHeight * 0.3;

        sections.forEach(section => {
            const rect = section.getBoundingClientRect();
            // If thetop of the section is above the trigger point
            // and the bottom is still on screen
            if (rect.top <= triggerPoint && rect.bottom >= triggerPoint) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            const href = link.getAttribute('href');
            if (href === `#${current}`) {
                link.classList.add('active');
            }
        });
    });
}

function setupMobileMenu() {
    const dropdown = document.querySelector('.dropdown');
    const dropBtn = document.querySelector('.dropbtn');

    if (dropdown && dropBtn) {
        // Toggle on click (essential for mobile)
        dropBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('active');
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });

        // Close when clicking a link inside
        const links = dropdown.querySelectorAll('a');
        links.forEach(link => {
            link.addEventListener('click', () => {
                dropdown.classList.remove('active');
            });
        });
    }
}

function filterProjects(category) {
    const cards = document.querySelectorAll('.project-card');
    const buttons = document.querySelectorAll('.filter-btn');

    // Update buttons
    buttons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick').includes(category)) {
            btn.classList.add('active');
        }
    });

    // Update cards
    cards.forEach(card => {
        const categories = card.getAttribute('data-category'); // 'llm', 'vision', etc.
        // Assuming single category for now or space separated? Legacy was simple.
        // If 'all', show all.
        if (category === 'all' || categories.includes(category)) {
            card.style.display = 'flex';
            // Animation reset?
            card.style.animation = 'none';
            card.offsetHeight; /* trigger reflow */
            card.style.animation = 'fadeIn 0.5s ease forwards';
        } else {
            card.style.display = 'none';
        }
    });
}
