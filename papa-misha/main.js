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

    var today = CFG.hours[now.day];
    if (today && now.mins >= today[0] && now.mins < today[1]) {
      pill.dataset.state = 'open';
      pill.textContent = 'Open now · until ' + hhmm(today[1]);
      return;
    }
    var names = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    for (var step = 0; step <= 7; step++) {
      var d = (now.day + step) % 7, slot = CFG.hours[d];
      if (!slot) continue;
      if (step === 0 && now.mins >= slot[0]) continue;
      pill.dataset.state = 'shut';
      var when = step === 0 ? 'today' : (step === 1 ? 'tomorrow' : names[d]);
      pill.textContent = 'Closed · opens ' + when + ' ' + hhmm(slot[0]);
      return;
    }
    pill.dataset.state = 'shut';
    pill.textContent = 'Closed';
  }

  /* ── 8. Live rating ───────────────────────────────────────────────── */
  /* data/reviews.json is refreshed by the update-reviews Action. The numbers
     baked into the HTML are the fallback, so a failed fetch is invisible. */
  function ago(iso) {
    var then = Date.parse(iso);
    if (isNaN(then)) return null;
    var mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 2) return 'just now';
    if (mins < 60) return mins + ' minutes ago';
    var h = Math.floor(mins / 60);
    if (h < 24) return h === 1 ? 'an hour ago' : h + ' hours ago';
    var d = Math.floor(h / 24);
    return d === 1 ? 'yesterday' : d + ' days ago';
  }

  function paintScore(data) {
    if (typeof data.rating === 'number') {
      var r = data.rating.toFixed(1);
      document.querySelectorAll('[data-score-rating]').forEach(function (el) { el.textContent = r; });
      var stars = document.getElementById('starRow');
      if (stars) {
        var full = Math.round(data.rating);
        stars.textContent = '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
        stars.setAttribute('aria-label', 'Rated ' + r + ' out of 5');
      }
    }
    if (typeof data.count === 'number') {
      document.querySelectorAll('[data-score-count]').forEach(function (el) {
        el.textContent = String(data.count);
      });
    }
    var stamp = document.getElementById('scoreStamp');
    if (stamp && data.updated) {
      var when = ago(data.updated);
      stamp.textContent = when ? 'Last checked ' + when : 'Checked daily';
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
