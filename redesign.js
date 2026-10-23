/* JDCODE redesign: hero A/B variants + dataLayer CTA/booking events.
   No new tracking IDs. Events go to window.dataLayer (GTM-compatible: {event: ...}).
   If GA4 (gtag) was loaded after consent, they are also sent as GA4 events. */
(function () {
    'use strict';
    window.dataLayer = window.dataLayer || [];
    var hero = document.querySelector('[data-hero-variant]');
    var variant = hero ? hero.getAttribute('data-hero-variant') : 'none';

    // Optional variant override for A/B tests: ?hv=a|b|c
    try {
        var hv = new URLSearchParams(location.search).get('hv');
        var all = hero && JSON.parse(hero.getAttribute('data-hero-variants') || '{}');
        if (hv && all && all[hv]) {
            hero.querySelector('[data-hero-h]').textContent = all[hv].h;
            hero.querySelector('[data-hero-s]').textContent = all[hv].s;
            hero.setAttribute('data-hero-variant', hv);
            variant = hv;
        }
    } catch (e) { /* ignore */ }

    function gtagEvent(name, params) {
        // Only forwards to GA4 if the consent-gated loader already initialised it.
        if (!window.trackingLoaded) return;
        (function () { window.dataLayer.push(arguments); })('event', name, params);
    }
    function track(name, params) {
        var budget = null; try { budget = sessionStorage.getItem('jd-budget'); } catch (e) {}
        params = Object.assign({ hero_variant: variant, page_language: document.documentElement.lang }, budget ? { budget_range: budget } : {}, params || {});
        window.dataLayer.push(Object.assign({ event: name }, params));
        gtagEvent(name, params);
    }
    window.jdTrack = track;

    document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('[data-cta]');
        if (!a) return;
        track('cta_click', {
            cta_type: a.getAttribute('data-cta'),
            cta_location: a.getAttribute('data-cta-location') || 'unknown',
            cta_text: (a.textContent || '').trim().slice(0, 80)
        });
    });

    // Booking completed: the Google Calendar appointment embed is cross-origin and has no
    // documented completion event. We listen for any postMessage from calendar.google.com and
    // log it as booking_completed only if it looks like a confirmation. Verify in GTM preview.
    var bookingSent = false;
    window.addEventListener('message', function (e) {
        if (bookingSent || !/^https:\/\/calendar\.google\.com$/.test(e.origin)) return;
        var d = typeof e.data === 'string' ? e.data : JSON.stringify(e.data || '');
        if (/book|confirm|scheduled/i.test(d)) {
            bookingSent = true;
            track('booking_completed', { booking_tool: 'google_calendar_appointments' });
        }
    });
    var cal = document.getElementById('booking-calendar');
    if (cal && 'IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (en) {
            if (en[0].isIntersecting) { track('booking_view', { booking_tool: 'google_calendar_appointments' }); io.disconnect(); }
        }, { threshold: 0.4 });
        io.observe(cal);
    }

    // Hide sticky mobile CTA while the booking section is on screen
    var sticky = document.querySelector('.sticky-cta'), contact = document.getElementById('contact');
    if (sticky && contact && 'IntersectionObserver' in window) {
        new IntersectionObserver(function (en) { sticky.classList.toggle('is-hidden', en[0].isIntersecting); }, { threshold: 0.1 }).observe(contact);
    }
})();

/* Budget qualification above the booking calendar */
(function () {
    var step = document.getElementById('budget-step');
    var wrap = document.querySelector('.calendar-wrapper');
    if (!step || !wrap) return;
    var lang = document.documentElement.lang;
    var stored = null; try { stored = sessionStorage.getItem('jd-budget'); } catch (e) {}
    function reveal(scroll) {
        wrap.classList.remove('is-collapsed');
        if (scroll) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (stored) {
        var r = step.querySelector('input[value="' + stored + '"]');
        if (r) r.checked = true;
    } else {
        wrap.classList.add('is-collapsed');
    }
    step.addEventListener('change', function (e) {
        if (!e.target.matches('input[name="budget"]')) return;
        var val = e.target.value;
        try { sessionStorage.setItem('jd-budget', val); } catch (err) {}
        window.dataLayer = window.dataLayer || [];
        if (window.jdTrack) window.jdTrack('budget_selected', { budget_range: val, lang: lang });
        else window.dataLayer.push({ event: 'budget_selected', budget_range: val, lang: lang });
        reveal(true);
    });
    var skip = step.querySelector('[data-budget-skip]');
    if (skip) skip.addEventListener('click', function () { reveal(true); });
})();
