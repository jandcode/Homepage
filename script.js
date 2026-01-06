document.addEventListener('DOMContentLoaded', () => {

    const navBar = document.querySelector('.nav-bar');

    // Scroll Effect for Navbar
    window.addEventListener('scroll', () => {
        if (window.scrollY > 20) {
            navBar.style.background = "rgba(255, 255, 255, 0.8)";
            navBar.style.backdropFilter = "blur(12px)";
            navBar.style.borderBottom = "1px solid rgba(0,0,0,0.05)";
            navBar.style.padding = "16px 0"; // shrink slightly
        } else {
            navBar.style.background = "rgba(255, 255, 255, 0.5)"; // original transparent
            navBar.style.backdropFilter = "blur(10px)";
            navBar.style.borderBottom = "1px solid rgba(0,0,0,0.03)";
            navBar.style.padding = "24px 0"; // original size
        }
    });

    // Simple fade-in animation for sections (Intersection Observer)
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('section').forEach(section => {
        section.classList.add('fade-in-section');
        section.style.opacity = "0";
        section.style.transform = "translateY(20px)";
        section.style.transition = "opacity 0.6s ease-out, transform 0.6s ease-out";
        section.style.willChange = "opacity, transform";
        observer.observe(section);
    });

    // JS side of the fade-in class logic if CSS is missing it
    document.head.insertAdjacentHTML("beforeend", `<style>
        section.visible { opacity: 1 !important; transform: none !important; }
    </style>`)

    // Mobile Menu Logic
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    // Create mobile menu container if not exists (simpler than editing HTML separately)
    let mobileMenu = document.querySelector('.mobile-menu');
    if (!mobileMenu) {
        mobileMenu = document.createElement('div');
        mobileMenu.classList.add('mobile-menu');
        mobileMenu.innerHTML = `
            <a href="/">Home</a>
            <a href="portfolio.html">Portfolio</a>
            <a href="/#about">Über mich</a>
            <a href="/#contact">Kontakt</a>
        `;
        // Insert after nav-bar
        navBar.after(mobileMenu);
    }

    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            mobileMenu.classList.toggle('open');
            // Change icon
            const icon = menuToggle.querySelector('i');
            if (mobileMenu.classList.contains('open')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-xmark');
            } else {
                icon.classList.remove('fa-xmark');
                icon.classList.add('fa-bars');
            }
        });

        // Close menu when clicking a link
        mobileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.remove('open');
                const icon = menuToggle.querySelector('i');
                icon.classList.remove('fa-xmark');
                icon.classList.add('fa-bars');
            });
        });
    }
});
