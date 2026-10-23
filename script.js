// i18n Logic starts here
const i18n = {
    // Pages with <html data-static-lang> have their language baked into the static HTML
    // (/ = DE, /en = EN). There, the language comes from <html lang> and the switcher
    // buttons are real links to the other URL — no runtime text replacement.
    staticLang: document.documentElement.hasAttribute('data-static-lang'),
    currentLang: document.documentElement.hasAttribute('data-static-lang')
        ? document.documentElement.lang
        : (localStorage.getItem('jd-lang') || (navigator.language.startsWith('de') ? 'de' : 'en')),

    init() {
        this.applyTranslations();
        this.updateActiveBtn();
        this.setupSwitcher();
    },

    applyTranslations() {
        if (this.staticLang) return;
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
                if (href.includes('#ki-hebel')) link.textContent = translations[this.currentLang]['nav-ki'];
                if (href.includes('#angebot')) link.textContent = translations[this.currentLang]['nav-services'];
                if (href.includes('#referenzen')) link.textContent = translations[this.currentLang]['nav-references'];
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
        if (typeof Counters !== 'undefined') Counters.refresh();
    },

    updateActiveBtn() {
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-lang') === this.currentLang);
        });
    },

    setupSwitcher() {
        if (this.staticLang) {
            document.querySelectorAll('.lang-btn').forEach(btn => {
                btn.addEventListener('click', () => localStorage.setItem('jd-lang', btn.getAttribute('data-lang')));
            });
            return;
        }
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
                navBar.style.background = "rgba(237, 230, 216, 0.88)";
                navBar.style.backdropFilter = "blur(12px)";
                navBar.style.borderBottom = "1px solid rgba(31, 61, 79, 0.10)";
                navBar.style.padding = "16px 0"; // shrink slightly
            } else {
                navBar.style.background = "rgba(237, 230, 216, 0.65)"; // original transparent
                navBar.style.backdropFilter = "blur(10px)";
                navBar.style.borderBottom = "1px solid rgba(31, 61, 79, 0.05)";
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
        const base = (i18n.staticLang && i18n.currentLang === 'en') ? '/en' : '/';
        mobileMenu.innerHTML = `
            <a href="${base}">${translations[i18n.currentLang]['nav-home']}</a>
            <a href="${base}#ki-hebel">${translations[i18n.currentLang]['nav-ki']}</a>
            <a href="${base}#angebot">${translations[i18n.currentLang]['nav-services']}</a>
            <a href="${base}#work">${translations[i18n.currentLang]['nav-work']}</a>
            <a href="${base}#referenzen">${translations[i18n.currentLang]['nav-references']}</a>
            <a href="${base}#contact" data-cta="book_call" data-cta-location="mobile_menu">${translations[i18n.currentLang]['nav-contact']}</a>
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

// --- Scroll FX: thread progress + blur-to-sharp reveals ---
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Scroll progress (0 → 1) drives the thread drawing and calms the blobs.
    if (prefersReducedMotion) {
        document.documentElement.style.setProperty('--scroll-p', '1');
    } else {
        let ticking = false;
        const updateProgress = () => {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
            document.documentElement.style.setProperty('--scroll-p', p.toFixed(4));
            ticking = false;
        };
        const onScroll = () => {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(updateProgress);
            }
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        updateProgress();
    }

    // 2. Blur-to-sharp reveals for elements with .reveal
    if (!prefersReducedMotion) {
        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15 });

        document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
    } else {
        document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
    }

    Counters.init();
});

// --- Counters: precise numbers, counted up like an instrument ---
const Counters = {
    format(value, decimals) {
        const s = Number(value).toFixed(decimals);
        return i18n.currentLang === 'de' ? s.replace('.', ',') : s;
    },

    animate(el) {
        const target = parseFloat(el.getAttribute('data-count'));
        const decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
        const duration = 1200;
        const start = performance.now();

        const step = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
            el.textContent = this.format(target * eased, decimals);
            if (t < 1) requestAnimationFrame(step);
            else el.dataset.done = 'true';
        };
        requestAnimationFrame(step);
    },

    init() {
        const els = document.querySelectorAll('.stat-num[data-count]');
        if (!els.length) return;

        if (prefersReducedMotion) {
            els.forEach(el => {
                el.textContent = this.format(el.getAttribute('data-count'), parseInt(el.getAttribute('data-decimals') || '0', 10));
                el.dataset.done = 'true';
            });
            return;
        }

        const counterObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.animate(entry.target);
                    counterObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.6 });

        els.forEach(el => counterObserver.observe(el));
    },

    // Re-render finished counters after a language switch (decimal comma vs. point)
    refresh() {
        document.querySelectorAll('.stat-num[data-count][data-done="true"]').forEach(el => {
            el.textContent = this.format(el.getAttribute('data-count'), parseInt(el.getAttribute('data-decimals') || '0', 10));
        });
    }
};

// --- Cookie Manager ---
const CookieManager = {
    config: [
        {
            label: 'Ghost Mode',
            emoji: '👻',
            consent: false,
            color: '#F4EFE3',
            textColor: '#1F3D4F',
            desc: {
                de: 'Kein Tracking. Nur essenzielle Cookies.',
                en: 'No tracking. Essential cookies only.'
            }
        },
        {
            label: 'Full Support',
            emoji: '❤️',
            consent: true,
            color: '#14213D',
            textColor: '#FFFCF6',
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
            iconWrapper.style.background = mode.consent ? `${mode.color}26` : 'rgba(61, 74, 46, 0.10)';
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
