document.addEventListener('DOMContentLoaded', () => {
    setupSmoothScroll();
    setupActiveNav();
});

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
            // If the top of the section is above the trigger point
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
