/* JDCODE tracking-focus page script. No new tracking IDs; consent logic ported from legacy script.js (same GA4 ID, same localStorage key). */
(function () {
  'use strict';
  var w = window, d = document;
  w.dataLayer = w.dataLayer || [];
  var lang = d.documentElement.lang === 'de' ? 'de' : 'en';
  var BKEY = 'jd_budget_range';

  // --- Hero variant (?hv=a|b|c) ---
  var hv = 'a';
  try {
    var q = new URLSearchParams(w.location.search).get('hv');
    if (q && /^[abc]$/.test(q.toLowerCase())) hv = q.toLowerCase();
  } catch (e) {}
  var hvData = d.getElementById('hero-variants');
  if (hvData && hv !== 'a') {
    try {
      var v = JSON.parse(hvData.textContent)[hv];
      if (v) {
        d.getElementById('hero-title').textContent = v.h;
        d.getElementById('hero-sub').textContent = v.s;
      }
    } catch (e) {}
  }
  d.documentElement.setAttribute('data-hero-variant', hv);

  function getBudget() { try { return localStorage.getItem(BKEY) || undefined; } catch (e) { return undefined; } }
  function push(ev, extra) {
    var o = { event: ev, lang: lang, hero_variant: hv };
    var b = getBudget(); if (b) o.budget_range = b;
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
    w.dataLayer.push(o);
  }
  w.jdTrack = push;

  // --- CTA clicks ---
  d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-cta]');
    if (!a) return;
    push('cta_click', { cta_location: a.getAttribute('data-cta-location') || 'unknown', cta_type: a.getAttribute('data-cta') });
  });

  // --- Budget radio group ---
  var form = d.getElementById('budget');
  var note = d.getElementById('budget-note');
  if (form) {
    var stored = getBudget();
    if (stored) {
      var r = form.querySelector('input[value="' + stored + '"]');
      if (r) r.checked = true;
    }
    form.addEventListener('change', function (e) {
      if (e.target.name !== 'budget') return;
      try { localStorage.setItem(BKEY, e.target.value); } catch (x) {}
      push('budget_selected', { budget_range: e.target.value });
      if (note) note.textContent = note.getAttribute('data-ok');
    });
    var skip = d.getElementById('budget-skip');
    if (skip) skip.addEventListener('click', function () {
      form.querySelectorAll('input').forEach(function (i) { i.checked = false; });
      try { localStorage.setItem(BKEY, 'skipped'); } catch (x) {}
      push('budget_selected', { budget_range: 'skipped' });
      if (note) note.textContent = note.getAttribute('data-skip');
    });
  }

  // --- Free check form (no backend: stored locally, event without PII, then to booking) ---
  var fc = d.getElementById('free-check');
  if (fc) fc.addEventListener('submit', function (e) {
    e.preventDefault();
    var u = fc.querySelector('#fc-url'), m = fc.querySelector('#fc-email'), n = d.getElementById('fc-note');
    if (!u.checkValidity() || !m.checkValidity()) { if (n) n.textContent = n.getAttribute('data-err'); return; }
    var host = ''; try { host = new URL(u.value).hostname; } catch (x) {}
    try { localStorage.setItem('jd_free_check', JSON.stringify({ url: u.value, email: m.value, ts: Date.now() })); } catch (x) {}
    push('free_check_request', { site_host: host });
    var c = d.getElementById('fc-confirm');
    if (c && n) c.textContent = n.getAttribute('data-ok');
    if (n) n.textContent = n.getAttribute('data-ok');
    var b = d.getElementById('booking'); if (b) b.scrollIntoView();
  });

  // --- Booking view / completion (best effort) ---
  var cal = d.getElementById('booking');
  if (cal && 'IntersectionObserver' in w) {
    var seen = false;
    new IntersectionObserver(function (en, ob) {
      if (!seen && en[0].isIntersecting) { seen = true; push('booking_view', {}); ob.disconnect(); }
    }, { threshold: 0.4 }).observe(cal);
  }
  // Google Calendar appointment embeds expose no completion callback. We record the first
  // interaction with the iframe; booking_completed fires for schedulers that postMessage (Calendly/Cal.com, TODO).
  var interacted = false;
  w.addEventListener('blur', function () {
    if (!interacted && d.activeElement && d.activeElement.id === 'cal-frame') { interacted = true; push('booking_interaction', {}); }
  });
  w.addEventListener('message', function (e) {
    var data = e.data, name = '';
    if (data && typeof data === 'object') name = data.event || data.type || '';
    if (name === 'calendly.event_scheduled' || name === 'bookingSuccessful' || name === 'bookingSuccessfulV2') push('booking_completed', { booking_tool: name.indexOf('calendly') === 0 ? 'calendly' : 'cal.com' });
  });

  // --- Consent (ported) ---
  var T = {
    en: { h: 'Cookies', p: 'Allow Google Analytics to measure visits to this site? Without consent, only essential storage is used.', y: 'Allow analytics', n: 'Essential only' },
    de: { h: 'Cookies', p: 'Dürfen wir Besuche mit Google Analytics messen? Ohne Zustimmung werden nur essenzielle Speicher genutzt.', y: 'Analyse erlauben', n: 'Nur essenzielle' }
  }[lang];
  function loadTracking() {
    if (w.trackingLoaded) return;
    w.trackingLoaded = true;
    var gaId = 'G-9QEFT8BN1J';
    var s = d.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + gaId; d.head.appendChild(s);
    function gtag() { w.dataLayer.push(arguments); }
    gtag('js', new Date()); gtag('config', gaId);
    if (!d.querySelector('script[src*="/_vercel/insights/script.js"]')) {
      var v = d.createElement('script'); v.defer = true; v.src = '/_vercel/insights/script.js'; d.head.appendChild(v);
    }
  }
  function banner() {
    var b = d.createElement('div');
    b.className = 'consent'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-labelledby', 'consent-h');
    b.innerHTML = '<h2 id="consent-h">' + T.h + '</h2><p>' + T.p + '</p><div class="ctas"><button class="btn btn-p" data-c="1">' + T.y + '</button><button class="btn btn-s" data-c="0">' + T.n + '</button></div>';
    b.addEventListener('click', function (e) {
      var t = e.target.closest('[data-c]'); if (!t) return;
      var ok = t.getAttribute('data-c') === '1';
      try { localStorage.setItem('consent_granted', String(ok)); } catch (x) {}
      b.remove(); if (ok) loadTracking();
    });
    d.body.appendChild(b);
  }
  d.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.cookie-reset-link')) {
      e.preventDefault();
      try { localStorage.removeItem('consent_granted'); } catch (x) {}
      w.location.reload();
    }
  });
  var c = null; try { c = localStorage.getItem('consent_granted'); } catch (x) {}
  if (c === 'true') loadTracking();
  else if (c !== 'false') setTimeout(banner, 800);
})();
