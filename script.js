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
    if (navBar) {
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
    }

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
        if (navBar) {
            navBar.after(mobileMenu);
        } else {
            document.body.prepend(mobileMenu);
        }
    }

    if (menuToggle && mobileMenu) {
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

// --- Cookie Manager ---
const CookieManager = {
    config: [
        {
            label: 'Ghost Mode',
            emoji: '👻',
            consent: false,
            color: '#F8F8F8',
            textColor: '#000',
            desc: {
                de: 'Kein Tracking. Nur essenzielle Cookies.',
                en: 'No tracking. Essential cookies only.'
            }
        },
        {
            label: 'Full Support',
            emoji: '❤️',
            consent: true,
            color: '#E84511',
            textColor: '#FFF',
            desc: {
                de: 'Aktiviert Google Analytics & Meta Pixel.',
                en: 'Enables Google Analytics & Meta Pixel.'
            }
        }
    ],

    init() {
        const consent = localStorage.getItem('consent_granted');

        // Listen for reset clicks on any page
        document.addEventListener('click', (e) => {
            if (e.target.closest('.cookie-reset-link')) {
                e.preventDefault();
                localStorage.removeItem('consent_granted');
                window.location.reload();
            }
        });

        if (consent === 'true') {
            this.loadTracking();
            return;
        }
        if (consent === 'false') return;

        this.render();
    },

    render() {
        const lang = i18n.currentLang;
        const banner = document.createElement('div');
        banner.className = 'cookie-banner';
        banner.style.display = 'flex';

        banner.innerHTML = `
            <div class="cookie-header">
                <div class="cookie-icon-wrapper" id="cookieIcon">👻</div>
                <div class="cookie-text">
                    <h4 data-i18n="cookie-title">${translations[lang]['cookie-title']}</h4>
                    <p id="cookieDesc">${this.config[0].desc[lang]}</p>
                </div>
            </div>
            <div class="cookie-slider-container">
                <input type="range" min="0" max="1" step="1" value="0" class="privacy-slider" id="cookieSlider">
            </div>
            <button class="cookie-btn" id="cookieConfirm" data-i18n="cookie-confirm">${translations[lang]['cookie-confirm']}</button>
        `;

        document.body.appendChild(banner);

        const slider = document.getElementById('cookieSlider');
        const iconWrapper = document.getElementById('cookieIcon');
        const descText = document.getElementById('cookieDesc');
        const confirmBtn = document.getElementById('cookieConfirm');

        slider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            const mode = this.config[val];

            iconWrapper.textContent = mode.emoji;
            iconWrapper.style.background = mode.consent ? `${mode.color}15` : '#F8F8F8';
            descText.textContent = mode.desc[lang];

            confirmBtn.style.background = mode.color;
            confirmBtn.style.color = mode.textColor;
        });

        confirmBtn.addEventListener('click', () => {
            const val = parseInt(slider.value);
            const choice = this.config[val].consent;
            localStorage.setItem('consent_granted', choice);

            banner.style.opacity = '0';
            banner.style.transform = 'translateY(20px)';
            setTimeout(() => banner.remove(), 600);

            if (choice) {
                this.loadTracking();
            }
        });
    },

    loadTracking() {
        if (window.trackingLoaded) return;
        window.trackingLoaded = true;

        // --- Google Analytics (GA4) ---
        const gaId = 'G-9QEFT8BN1J';
        const gaScript = document.createElement('script');
        gaScript.async = true;
        gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
        document.head.appendChild(gaScript);

        window.dataLayer = window.dataLayer || [];
        function gtag() { dataLayer.push(arguments); }
        gtag('js', new Date());
        gtag('config', gaId);

        // --- Vercel Insights ---
        if (!document.querySelector('script[src*="/_vercel/insights/script.js"]')) {
            const vercelScript = document.createElement('script');
            vercelScript.defer = true;
            vercelScript.src = '/_vercel/insights/script.js';
            document.head.appendChild(vercelScript);
        }

        console.log('Tracking infrastructure (GA4 & Vercel) initialized.');
    }
};

// Start Cookie Manager after a short delay
setTimeout(() => CookieManager.init(), 1000);
