/* ═══════════════════════════════════════════════════════════════════════
   soch-venue-template — motion, depth, opening state, live rating.

   Derived from the Meet & Eat build, with three changes:
     · parallax writes CSS custom properties (--pxY) instead of setting
       `transform` directly, so it composes with the 3D layer's translateZ
       rather than overwriting it
     · opening hours come from the inlined #venue-runtime blob, not a
       hardcoded table
     · GSAP + Lenis are used when present and depth="full"; the page is
       fully functional without them
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var DEPTH = document.body.getAttribute('data-depth') || 'full';
  var has3D = DEPTH !== 'off' && !reduced.matches;

  /* ── 0. Runtime config ────────────────────────────────────────────── */
  var CFG = { timezone: 'Europe/Tallinn', hours: {}, ratingSource: 'Google' };
  try {
    var blob = document.getElementById('venue-runtime');
    if (blob) CFG = Object.assign(CFG, JSON.parse(blob.textContent));
  } catch (e) { /* fall through to defaults */ }

  /* ── 0b. Language ─────────────────────────────────────────────────────
     The page ships rendered in one language and carries the others as flat
     dictionaries keyed by the same dotted paths as the data-i18n attributes.
     Switching is a DOM pass, not a page load, so the visitor keeps their
     scroll position and nothing re-downloads.

     Every string that mentions a number (the review count, the rating) is a
     template with a {placeholder}, because the live rating can land after the
     page has already been translated. Both paths funnel through paintI18n. */
  var LANG = CFG.lang || 'en';
  var LANGS = CFG.langs || [LANG];
  var SCORE = { rating: CFG.rating, count: CFG.count };
  var CHROME = {};

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* This copy carries authored inline markup — <em> for emphasis, <br> for a
     deliberate line break in a heading. Assigning it as HTML would be the
     obvious move and is not worth the risk, so the string is parsed and
     rebuilt from an allow-list instead: these six tags, and NO attributes at
     all, so there is nothing for a handler or a URL to ride in on. Anything
     else is unwrapped and its text kept. */
  var RICH_OK = { EM: 1, I: 1, B: 1, STRONG: 1, BR: 1, CODE: 1 };

  function copyKids(from, to) {
    for (var n = from.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { to.appendChild(document.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1) continue;
      if (!RICH_OK[n.nodeName]) { copyKids(n, to); continue; }
      var el = document.createElement(n.nodeName.toLowerCase());
      copyKids(n, el);
      to.appendChild(el);
    }
  }

  function setRich(el, html) {
    if (String(html).indexOf('<') === -1) { el.textContent = html; return; }
    var doc;
    try { doc = new DOMParser().parseFromString('<body><div>' + html + '</div>', 'text/html'); }
    catch (e) { el.textContent = String(html); return; }
    var src = doc.body && doc.body.firstChild;
    if (!src) { el.textContent = String(html); return; }
    while (el.firstChild) el.removeChild(el.firstChild);
    copyKids(src, el);
  }

  /** ui/rt tables for a language: defaults from the blob, overlaid with that
   *  language's dictionary. Arrays are copied, never shared with the default. */
  function chrome(lang) {
    if (CHROME[lang]) return CHROME[lang];
    var ui = {}, rt = {}, k;
    for (k in (CFG.ui || {})) if (own(CFG.ui, k)) ui[k] = CFG.ui[k];
    for (k in (CFG.rt || {})) {
      if (!own(CFG.rt, k)) continue;
      rt[k] = Object.prototype.toString.call(CFG.rt[k]) === '[object Array]'
        ? CFG.rt[k].slice() : CFG.rt[k];
    }
    var src = (CFG.dicts || {})[lang] || {};
    for (k in src) {
      if (!own(src, k)) continue;
      var p = k.split('.');
      if (p[0] === 'ui' && p.length === 2) ui[p[1]] = src[k];
      else if (p[0] === 'rt' && p.length === 2) rt[p[1]] = src[k];
      else if (p[0] === 'rt' && p.length === 3) {
        if (Object.prototype.toString.call(rt[p[1]]) !== '[object Array]') rt[p[1]] = [];
        rt[p[1]][parseInt(p[2], 10)] = src[k];
      }
    }
    CHROME[lang] = { ui: ui, rt: rt };
    return CHROME[lang];
  }

  function fill(s, v) {
    if (s == null) return s;
    return String(s).replace(/\{([a-z]+)\}/gi, function (m, key) {
      return v && v[key] != null && v[key] !== '' ? v[key] : m;
    });
  }

  function slots(extra) {
    var v = {
      name: CFG.venueName || '',
      source: CFG.ratingSource || 'Google',
      count: SCORE.count == null ? '' : String(SCORE.count),
      value: SCORE.rating == null ? '' : Number(SCORE.rating).toFixed(1)
    };
    if (extra) for (var k in extra) if (own(extra, k)) v[k] = extra[k];
    return v;
  }

  /** Resolve one data-i18n key for the active language. */
  function str(key, el) {
    var c = chrome(LANG);
    if (key.indexOf('ui.') === 0) {
      var extra = null;
      /* per-element slot, e.g. the delivery brand in "Full menu on {brand}" */
      var brand = el && el.getAttribute && el.getAttribute('data-i18n-var-brand');
      if (brand) extra = { brand: brand };
      return fill(c.ui[key.slice(3)], slots(extra));
    }
    var dict = (CFG.dicts || {})[LANG];
    return dict && own(dict, key) ? dict[key] : null;
  }

  /** Repaint every translated string on the page. */
  function paintI18n() {
    var nodes = document.querySelectorAll('[data-i18n]'), i;
    for (i = 0; i < nodes.length; i++) {
      var v = str(nodes[i].getAttribute('data-i18n'), nodes[i]);
      if (v != null) setRich(nodes[i], v);
    }
    var attrNodes = document.querySelectorAll('[data-i18n-attr]');
    for (i = 0; i < attrNodes.length; i++) {
      var node = attrNodes[i];
      var specs = node.getAttribute('data-i18n-attr').split(';');
      for (var s = 0; s < specs.length; s++) {
        var at = specs[s].indexOf(':');
        if (at === -1) continue;
        var val = str(specs[s].slice(at + 1).trim(), node);
        if (val != null) node.setAttribute(specs[s].slice(0, at).trim(), val);
      }
    }
  }

  function applyLang(lang) {
    if (!lang || lang === LANG) return;
    if (!(CFG.dicts || {})[lang]) return;      // no dictionary, no switch
    LANG = lang;
    document.documentElement.setAttribute('lang', lang);
    var btns = document.querySelectorAll('.langswitch button[data-lang]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed',
        btns[i].getAttribute('data-lang') === lang ? 'true' : 'false');
    }
    paintI18n();
    paintHours();                              // the open/closed pill is prose
    try { localStorage.setItem('venue-lang', lang); } catch (e) { /* private mode */ }
  }

  /** The visitor's own preference, if this site actually has it. */
  function preferredLang() {
    var wanted = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < wanted.length; i++) {
      var code = String(wanted[i]).toLowerCase().split('-')[0];
      if (LANGS.indexOf(code) !== -1) return code;
    }
    return null;
  }

  function startLangs() {
    var box = document.querySelector('.langswitch');
    if (box) {
      box.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('button[data-lang]') : null;
        if (b) applyLang(b.getAttribute('data-lang'));
      });
    }
    var saved = null;
    try { saved = localStorage.getItem('venue-lang'); } catch (e) { /* ignore */ }
    applyLang(saved && LANGS.indexOf(saved) !== -1 ? saved : preferredLang());
  }

  /* ── 1. Parallax → --pxY ──────────────────────────────────────────── */
  var layers = [], ticking = false, pxObserver = null;

  function collect() {
    layers = [];
    var nodes = document.querySelectorAll('[data-px]');
    for (var i = 0; i < nodes.length; i++) {
      layers.push({ el: nodes[i], speed: parseFloat(nodes[i].dataset.px) || 0, on: false });
    }
  }
  function scale() { return window.innerWidth < 720 ? 0.45 : 1; }

  function render() {
    ticking = false;
    if (reduced.matches) return;
    var vh = window.innerHeight, k = scale();
    for (var i = 0; i < layers.length; i++) {
      var L = layers[i];
      if (!L.on) continue;
      var r = L.el.getBoundingClientRect();
      var p = ((r.top + r.height / 2) - vh / 2) / (vh / 2 + r.height / 2);
      if (p < -1.6 || p > 1.6) continue;
      L.el.style.setProperty('--pxY', (p * L.speed * vh * 0.34 * k).toFixed(2) + 'px');
    }
  }
  function onScroll() {
    if (!ticking) { ticking = true; window.requestAnimationFrame(render); }
  }

  if ('IntersectionObserver' in window) {
    pxObserver = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        for (var j = 0; j < layers.length; j++) {
          if (layers[j].el === entries[i].target) {
            layers[j].on = entries[i].isIntersecting;
            if (!entries[i].isIntersecting) layers[j].el.style.setProperty('--pxY', '0px');
          }
        }
      }
      onScroll();
    }, { rootMargin: '25% 0px 25% 0px' });
  }

  function startParallax() {
    collect();
    if (pxObserver) { for (var i = 0; i < layers.length; i++) pxObserver.observe(layers[i].el); }
    else { for (var k = 0; k < layers.length; k++) layers[k].on = true; }
    render();
  }
  function stopParallax() {
    for (var i = 0; i < layers.length; i++) layers[i].el.style.setProperty('--pxY', '0px');
  }

  /* ── 2. Pointer tilt → --mx / --my ────────────────────────────────── */
  /* Normalised to -1..1 from the card's own centre, so the tilt reads as
     the card facing the cursor rather than swinging with the whole page. */
  function startTilt() {
    if (!has3D) return;
    if (!window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;

    var cards = document.querySelectorAll('.combo, .card, .quote');
    for (var i = 0; i < cards.length; i++) {
      (function (el) {
        el.addEventListener('pointermove', function (ev) {
          var r = el.getBoundingClientRect();
          var mx = (ev.clientX - r.left) / r.width * 2 - 1;
          var my = (ev.clientY - r.top) / r.height * 2 - 1;
          el.style.setProperty('--mx', mx.toFixed(3));
          el.style.setProperty('--my', my.toFixed(3));
        }, { passive: true });
        el.addEventListener('pointerleave', function () {
          el.style.setProperty('--mx', '0');
          el.style.setProperty('--my', '0');
        }, { passive: true });
      })(cards[i]);
    }
  }

  /* ── 3. Scroll progress → --sp on the menu ────────────────────────── */
  function startScrollProgress() {
    if (!has3D) return;
    var menu = document.getElementById('menu');
    if (!menu) return;
    function paint() {
      var r = menu.getBoundingClientRect();
      var vh = window.innerHeight;
      var p = 1 - Math.min(1, Math.max(0, (r.top + r.height * 0.25) / vh));
      menu.style.setProperty('--sp', p.toFixed(3));
    }
    window.addEventListener('scroll', paint, { passive: true });
    paint();
  }

  /* ── 4. GSAP + Lenis, when vendored and depth allows ──────────────── */
  function startEnhanced() {
    if (!has3D || DEPTH !== 'full') return;
    if (!window.gsap) return;

    if (window.Lenis) {
      var lenis = new window.Lenis({ duration: 1.05, smoothWheel: true });
      function raf(t) { lenis.raf(t); requestAnimationFrame(raf); }
      requestAnimationFrame(raf);
      if (window.ScrollTrigger) {
        lenis.on('scroll', window.ScrollTrigger.update);
      }
    }

    if (!window.ScrollTrigger) return;
    window.gsap.registerPlugin(window.ScrollTrigger);

    // hero copy recedes as you scroll past it
    var heroInner = document.querySelector('.hero__inner');
    if (heroInner) {
      window.gsap.to(heroInner, {
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 },
        z: -220, opacity: 0.25, ease: 'none'
      });
    }

    // gallery figures drift on their own planes
    var figs = document.querySelectorAll('.kfig');
    for (var i = 0; i < figs.length; i++) {
      window.gsap.fromTo(figs[i],
        { rotateY: i % 2 ? 5 : -5 },
        {
          rotateY: 0,
          scrollTrigger: { trigger: figs[i], start: 'top 85%', end: 'bottom 40%', scrub: 0.8 },
          ease: 'none'
        });
    }
  }

  /* ── 5. Reveals ───────────────────────────────────────────────────── */
  function startReveals() {
    var items = document.querySelectorAll('.reveal');
    if (reduced.matches || !('IntersectionObserver' in window)) {
      for (var i = 0; i < items.length; i++) items[i].classList.add('in');
      return;
    }
    var io = new IntersectionObserver(function (entries, obs) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          entries[i].target.classList.add('in');
          obs.unobserve(entries[i].target);
        }
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    for (var j = 0; j < items.length; j++) io.observe(items[j]);
  }

  /* ── 6. Nav ───────────────────────────────────────────────────────── */
  var nav = document.getElementById('nav');
  function navState() {
    if (nav) nav.dataset.stuck = window.scrollY > 40 ? 'true' : 'false';
  }

  /* ── 7. Opening hours, in the venue's own timezone ────────────────── */
  /* CFG.hours: { "<dow>": [openMinutes, closeMinutes] | null } */
  function hhmm(m) {
    var h = Math.floor(m / 60), n = m % 60;
    return (h < 10 ? '0' : '') + h + ':' + (n < 10 ? '0' : '') + n;
  }
  function venueNow() {
    var parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: CFG.timezone, weekday: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date());
    var map = {};
    for (var i = 0; i < parts.length; i++) map[parts[i].type] = parts[i].value;
    var days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { day: days[map.weekday], mins: parseInt(map.hour, 10) * 60 + parseInt(map.minute, 10) };
  }

  function paintHours() {
    var now;
    try { now = venueNow(); } catch (e) { return; }

    var row = document.querySelector('.hours tr[data-day="' + now.day + '"]');
    if (row) row.setAttribute('data-today', '');

    var pill = document.getElementById('openState');
    if (!pill) return;

    var rt = chrome(LANG).rt;
    var today = CFG.hours[now.day];
    if (today && now.mins >= today[0] && now.mins < today[1]) {
      pill.dataset.state = 'open';
      pill.textContent = fill(rt.openUntil, { time: hhmm(today[1]) });
      return;
    }
    var names = rt.weekdays || [];
    for (var step = 0; step <= 7; step++) {
      var d = (now.day + step) % 7, slot = CFG.hours[d];
      if (!slot) continue;
      if (step === 0 && now.mins >= slot[0]) continue;
      pill.dataset.state = 'shut';
      var when = step === 0 ? rt.today : (step === 1 ? rt.tomorrow : names[d]);
      pill.textContent = fill(rt.closedOpens, { when: when, time: hhmm(slot[0]) });
      return;
    }
    pill.dataset.state = 'shut';
    pill.textContent = rt.closed;
  }

  /* ── 8. Live rating ───────────────────────────────────────────────── */
  /* data/reviews.json is refreshed by the update-reviews Action. The numbers
     baked into the HTML are the fallback, so a failed fetch is invisible. */
  function ago(iso) {
    var then = Date.parse(iso);
    if (isNaN(then)) return null;
    var rt = chrome(LANG).rt;
    var mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 2) return rt.justNow;
    if (mins < 60) return fill(rt.minutesAgo, { n: mins });
    var h = Math.floor(mins / 60);
    if (h < 24) return h === 1 ? rt.anHourAgo : fill(rt.hoursAgo, { n: h });
    var d = Math.floor(h / 24);
    return d === 1 ? rt.yesterday : fill(rt.daysAgo, { n: d });
  }

  function paintScore(data) {
    /* Numbers first, into SCORE, because the strings that mention them are
       translated templates: the review count now lives inside one sentence
       ("from {count} {source} reviews") rather than its own <span>, so word
       order round it can differ by language. paintI18n refills them. */
    if (typeof data.rating === 'number') SCORE.rating = data.rating;
    if (typeof data.count === 'number') SCORE.count = data.count;

    if (typeof data.rating === 'number') {
      var r = data.rating.toFixed(1);
      document.querySelectorAll('[data-score-rating]').forEach(function (el) { el.textContent = r; });
      var stars = document.getElementById('starRow');
      if (stars) {
        var full = Math.round(data.rating);
        stars.textContent = '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
      }
    }
    /* Repaint so the count/rating slots pick up the new numbers. Cheap (about
       100 nodes) and it keeps one code path for "fill the templates". */
    paintI18n();

    var stamp = document.getElementById('scoreStamp');
    if (stamp && data.updated) {
      var rt = chrome(LANG).rt;
      var when = ago(data.updated);
      stamp.textContent = when ? fill(rt.lastChecked, { when: when }) : rt.checkedDaily;
    }
  }

  function loadScore() {
    fetch('data/reviews.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) paintScore(d); })
      .catch(function () { /* keep the values already in the markup */ });
  }

  /* ── 9. Hero video ────────────────────────────────────────────────── */
  function primeVideo() {
    var v = document.querySelector('.hero__video');
    if (!v) return;
    function kick() {
      var p = v.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    }
    kick();
    ['touchstart', 'click', 'scroll'].forEach(function (evt) {
      window.addEventListener(evt, kick, { once: true, passive: true });
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) {
        if (e[0].isIntersecting) kick(); else v.pause();
      }, { threshold: 0.01 }).observe(v);
    }
    if (reduced.matches) v.pause();
  }

  /* ── 10. Boot ─────────────────────────────────────────────────────── */
  function init() {
    var yr = document.getElementById('yr');
    if (yr) yr.textContent = new Date().getFullYear();

    startLangs();          // before paintHours, so the pill is written once
    paintHours();
    setInterval(paintHours, 60000);

    loadScore();
    startReveals();
    primeVideo();
    navState();
    startTilt();
    startScrollProgress();
    startEnhanced();
    if (!reduced.matches) startParallax();

    window.addEventListener('scroll', function () { onScroll(); navState(); }, { passive: true });
    window.addEventListener('resize', function () { collect(); onScroll(); }, { passive: true });

    if (reduced.addEventListener) {
      reduced.addEventListener('change', function () {
        if (reduced.matches) stopParallax(); else startParallax();
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
