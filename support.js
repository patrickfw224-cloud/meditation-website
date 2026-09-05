/* Nocturne — shared behaviour for every page. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Header: show a hairline once the page has scrolled. */
  var header = document.querySelector('.site-header');
  if (header) {
    var updateHeader = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
  }

  /* Mobile navigation. */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('primary-nav');
  if (toggle && nav) {
    var setOpen = function (open) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('nav-open', open);
    };
    toggle.addEventListener('click', function () { setOpen(!nav.classList.contains('is-open')); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
    });
    var wide = window.matchMedia('(min-width: 841px)');
    (wide.addEventListener || wide.addListener).call(wide, 'change', function (e) { if (e.matches) setOpen(false); });
  }

  /* Stagger index for grids that reveal as a group. */
  document.querySelectorAll('[data-stagger]').forEach(function (group) {
    Array.prototype.forEach.call(group.children, function (child, i) { child.style.setProperty('--i', i); });
  });

  /* Hero passages: a sticky stage whose art and copy crossfade with scroll position. */
  (function () {
  var passages = document.querySelector('[data-passages]');
  if (!passages) return;
    var stage = passages.querySelector('.passages-stage');
    var arts = Array.prototype.slice.call(passages.querySelectorAll('.passage-art'));
    var copies = Array.prototype.slice.call(passages.querySelectorAll('.passage'));
    var dots = Array.prototype.slice.call(passages.querySelectorAll('.passages-dots button'));
    var count = copies.length;
    var active = -1, ticking = false;

    var setActive = function (i) {
      if (i === active) return;
      active = i;
      arts.forEach(function (a, k) { a.classList.toggle('is-active', k === i); });
      copies.forEach(function (c, k) {
        c.classList.toggle('is-active', k === i);
        c.setAttribute('aria-hidden', k === i ? 'false' : 'true');
      });
      dots.forEach(function (d, k) {
        d.classList.toggle('is-active', k === i);
        if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
      passages.classList.toggle('is-scrolled', i > 0);
    };
    var scrollRange = function () { return Math.max(1, passages.offsetHeight - stage.offsetHeight); };
    var update = function () {
      ticking = false;
      var top = passages.getBoundingClientRect().top;
      var progress = Math.min(1, Math.max(0, -top / scrollRange()));
      setActive(Math.min(count - 1, Math.round(progress * (count - 1))));
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    dots.forEach(function (d, k) {
      d.addEventListener('click', function () {
        var target = passages.getBoundingClientRect().top + window.scrollY + (scrollRange() * k) / (count - 1);
        window.scrollTo({ top: target, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      });
    });
    update();
  })();

  /* Reveal on scroll. Decorative, one-shot, and skipped without IntersectionObserver. */
  var revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    if (!('IntersectionObserver' in window)) {
      revealEls.forEach(function (el) { el.classList.add('is-visible'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      revealEls.forEach(function (el) { io.observe(el); });
    }
  }

  /* Footer year. */
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  /* Newsletter: there is no backend, so acknowledge locally. */
  document.querySelectorAll('form[data-newsletter]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = form.querySelector('input[type="email"]');
      if (!input.checkValidity()) { input.reportValidity(); return; }
      try { localStorage.setItem('nocturne.newsletter', input.value); } catch (err) { /* storage unavailable */ }
      var note = form.parentElement.querySelector('.form-note');
      form.hidden = true;
      if (note) { note.textContent = 'Thank you. The next letter will find you.'; note.hidden = false; }
    });
  });

  /* Box-breathing tool (landing page). */
  var stage = document.querySelector('[data-breathe]');
  var breatheBtn = document.querySelector('[data-breathe-toggle]');
  if (stage && breatheBtn) {
    var orb = stage.querySelector('.breathe-orb');
    var count = stage.querySelector('.breathe-count');
    var phaseEl = stage.querySelector('.breathe-phase');
    var cyclesEl = document.querySelector('[data-breathe-cycles]');
    var PHASES = [
      { label: 'Breathe in', scale: 1.6, seconds: 4 },
      { label: 'Hold', scale: 1.6, seconds: 4 },
      { label: 'Breathe out', scale: 1, seconds: 4 },
      { label: 'Hold', scale: 1, seconds: 4 }
    ];
    var running = false, timer = null, tick = null, phase = 0, done = 0, currentScale = 1;

    var runPhase = function () {
      var p = PHASES[phase];
      phaseEl.textContent = p.label;
      if (!reduceMotion.matches) {
        orb.style.transitionDuration = (p.scale !== currentScale ? p.seconds * 1000 : 0) + 'ms';
        orb.style.transform = 'scale(' + p.scale + ')';
        currentScale = p.scale;
      }
      var remaining = p.seconds;
      count.textContent = String(remaining);
      tick = setInterval(function () {
        remaining -= 1;
        if (remaining > 0) count.textContent = String(remaining);
      }, 1000);
      timer = setTimeout(function () {
        clearInterval(tick);
        phase = (phase + 1) % PHASES.length;
        if (phase === 0) {
          done += 1;
          if (cyclesEl) cyclesEl.textContent = done === 1 ? '1 round' : done + ' rounds';
        }
        runPhase();
      }, p.seconds * 1000);
    };
    var start = function () {
      running = true; phase = 0; done = 0;
      breatheBtn.textContent = 'Stop';
      stage.classList.add('is-running');
      if (cyclesEl) cyclesEl.textContent = '';
      runPhase();
    };
    var stop = function () {
      running = false;
      clearTimeout(timer); clearInterval(tick);
      breatheBtn.textContent = 'Begin';
      stage.classList.remove('is-running');
      phaseEl.textContent = 'Ready when you are';
      count.textContent = '';
      orb.style.transitionDuration = '600ms';
      orb.style.transform = 'scale(1)';
      currentScale = 1;
    };
    breatheBtn.addEventListener('click', function () { running ? stop() : start(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && running) stop(); });
  }
})();
