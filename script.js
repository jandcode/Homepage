// i18n Logic starts here
const i18n = {
    currentLang: localStorage.getItem('jd-lang') || (navigator.language.startsWith('de') ? 'de' : 'en'),

    init() {
        this.applyTranslations();
        this.updateActiveBtn();
        this.setupSwitcher();
    },

    applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[this.currentLang] && translations[this.currentLang][key]) {
                el.innerHTML = translations[this.currentLang][key];
            }
        });

        // Meta Translation
        const isPortfolio = window.location.pathname.includes('portfolio');
        const titleKey = isPortfolio ? 'portfolio-meta-title' : 'home-meta-title';
        const descKey = isPortfolio ? 'portfolio-meta-desc' : 'home-meta-desc';

        if (translations[this.currentLang][titleKey]) {
            document.title = translations[this.currentLang][titleKey];
        }
        if (translations[this.currentLang][descKey]) {
            const metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) metaDesc.setAttribute('content', translations[this.currentLang][descKey]);
        }

        // Special case for mobile menu links if they are already in the DOM
        const mobileMenu = document.querySelector('.mobile-menu');
        if (mobileMenu) {
            mobileMenu.querySelectorAll('a').forEach(link => {
                const href = link.getAttribute('href');
                if (href === '/' || href === 'index.html') link.textContent = translations[this.currentLang]['nav-home'];
                if (href === 'portfolio.html' || href === '#ai-integration') link.textContent = translations[this.currentLang]['nav-works'] || translations[this.currentLang]['nav-ai'];
                if (href.includes('#about')) link.textContent = translations[this.currentLang]['nav-about'];
                if (href.includes('#contact')) link.textContent = translations[this.currentLang]['nav-contact'];
                if (href === '#ecommerce') link.textContent = translations[this.currentLang]['nav-shop'];
                if (href === '#tracking') link.textContent = translations[this.currentLang]['nav-tracking'];
                if (href === '#matterport') link.textContent = translations[this.currentLang]['nav-3d'];
            });
        }
    },

    setLang(lang) {
        this.currentLang = lang;
        localStorage.setItem('jd-lang', lang);
        this.applyTranslations();
        this.updateActiveBtn();
    },

    updateActiveBtn() {
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-lang') === this.currentLang);
        });
    },

    setupSwitcher() {
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setLang(btn.getAttribute('data-lang'));
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    i18n.init();

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
        // Initial mobile menu content based on current lang
        mobileMenu.innerHTML = `
            <a href="/">${translations[i18n.currentLang]['nav-home']}</a>
            <a href="portfolio.html">${translations[i18n.currentLang]['nav-works']}</a>
            <a href="/#about">${translations[i18n.currentLang]['nav-about']}</a>
            <a href="/#contact">${translations[i18n.currentLang]['nav-contact']}</a>
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
