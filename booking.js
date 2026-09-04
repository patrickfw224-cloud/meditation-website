/* Nocturne — booking flow. Fully client-side: bookings are kept in localStorage,
   an unfinished booking is kept in sessionStorage. Replace confirmBooking() to
   talk to a real backend. */
(function () {
  'use strict';

  var PRACTICES = {
    breath:    { name: 'Breath',             minutes: 25, guide: 'Mara Ellison', slots: ['18:00', '19:00', '20:00', '21:00', '22:00'] },
    focus:     { name: 'Single-point focus', minutes: 30, guide: 'Tomas Reyes',  slots: ['18:00', '19:00', '20:00', '21:00'] },
    body:      { name: 'Body scan',          minutes: 40, guide: 'Ines Okafor',  slots: ['18:00', '19:00', '20:00', '21:00'] },
    kindness:  { name: 'Loving-kindness',    minutes: 30, guide: 'Ines Okafor',  slots: ['18:00', '19:00', '20:00'] },
    grounding: { name: 'Grounding',          minutes: 25, guide: 'Tomas Reyes',  slots: ['19:00', '20:00', '21:00', '22:00'] },
    sleep:     { name: 'Sleep descent',      minutes: 60, guide: 'Mara Ellison', slots: ['21:00', '22:00'] }
  };
  var PLANS = {
    single:  { name: 'Single sitting', price: 18 },
    five:    { name: 'Five sittings',  price: 75 },
    monthly: { name: 'Monthly',        price: 110 }
  };
  var FORMATS = { online: 'Online', studio: 'In studio' };
  var LEVELS = { new: 'New to meditation', some: 'Some experience', regular: 'Regular practice' };
  var STUDIO_ADDRESS = '14 Lantern Lane, Rivermouth';
  var STUDIO_EMAIL = 'hello@nocturne.example';
  var MAX_DAYS_AHEAD = 60;
  var MIN_NOTICE_MS = 60 * 60 * 1000;
  var STORAGE_KEY = 'nocturne.bookings';
  var DRAFT_KEY = 'nocturne.draft';

  var form = document.getElementById('booking-form');
  if (!form) return;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- state ---------- */
  var defaults = {
    step: 1, practice: null, format: 'online', plan: 'single', date: null, slot: null,
    name: '', email: '', phone: '', level: 'new', notes: '', consent: false
  };
  var state = Object.assign({}, defaults);
  var viewMonth = null;
  var today = startOfDay(new Date());
  var maxDate = addDays(today, MAX_DAYS_AHEAD);
  var lastBooking = null;

  /* ---------- helpers ---------- */
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function pad(n) { return String(n).length < 2 ? '0' + n : String(n); }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseIso(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function slotDate(iso, slot) { var d = parseIso(iso); var t = slot.split(':').map(Number); d.setHours(t[0], t[1], 0, 0); return d; }
  function fmtDate(d, opts) {
    return new Intl.DateTimeFormat(undefined, opts || { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  }
  function fmtTime(slot) {
    var t = slot.split(':').map(Number);
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, t[0], t[1]));
  }
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function announce(msg) { var live = $('#booking-live'); if (live) { live.textContent = ''; setTimeout(function () { live.textContent = msg; }, 30); } }
  function setError(id, msg) { var node = $('#' + id); if (node) node.textContent = msg || ''; }

  function loadBookings() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { return []; } }
  function saveBookings(list) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ } }
  function saveDraft() { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  function loadDraft() { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY)); } catch (e) { return null; } }
  function clearDraft() { try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ } }

  /* Simulated capacity: a deterministic subset of slots is already full. */
  function slotStatus(iso, slot, practice) {
    var mine = loadBookings().some(function (b) { return b.status !== 'cancelled' && b.date === iso && b.slot === slot; });
    if (mine) return 'mine';
    if (slotDate(iso, slot).getTime() - Date.now() < MIN_NOTICE_MS) return 'past';
    if (hash(iso + '|' + slot + '|' + practice) % 6 === 0) return 'full';
    return 'open';
  }

  /* ---------- elements ---------- */
  var panels = $$('.panel[data-panel]', form);
  var steps = $$('.stepper .step');
  var practiceInputs = $$('input[name="practice"]', form);
  var formatInputs = $$('input[name="format"]', form);
  var planSelect = $('#plan');
  var calTitle = $('#cal-title'), calDays = $('#cal-days'), prevBtn = $('#cal-prev'), nextBtn = $('#cal-next');
  var slotGrid = $('#slot-grid'), slotHint = $('#slot-hint'), tzNote = $('#tz-note');
  var review = $('#review');
  var confirmation = $('#confirmation');
  var sessionList = $('#session-list');
  var sum = {
    practice: $('#sum-practice'), guide: $('#sum-guide'), format: $('#sum-format'),
    when: $('#sum-when'), plan: $('#sum-plan'), total: $('#sum-total')
  };
  var fields = { name: $('#name'), email: $('#email'), phone: $('#phone'), level: $('#level'), notes: $('#notes'), consent: $('#consent') };

  /* ---------- summary ---------- */
  function updateSummary() {
    var p = state.practice ? PRACTICES[state.practice] : null;
    var plan = PLANS[state.plan];
    sum.practice.textContent = p ? p.name + ' · ' + p.minutes + ' min' : '—';
    sum.guide.textContent = p ? p.guide : '—';
    sum.format.textContent = FORMATS[state.format];
    sum.when.textContent = state.date
      ? fmtDate(parseIso(state.date), { weekday: 'short', day: 'numeric', month: 'short' }) + (state.slot ? ', ' + fmtTime(state.slot) : '')
      : '—';
    sum.plan.textContent = plan.name;
    sum.total.textContent = '$' + plan.price;
  }

  /* ---------- steps ---------- */
  function showStep(n, focus) {
    state.step = n;
    panels.forEach(function (p) { p.hidden = Number(p.dataset.panel) !== n; });
    steps.forEach(function (s, i) {
      s.classList.toggle('is-current', i + 1 === n);
      s.classList.toggle('is-done', i + 1 < n);
      if (i + 1 === n) s.setAttribute('aria-current', 'step'); else s.removeAttribute('aria-current');
    });
    if (n === 2) renderCalendar();
    if (n === 4) renderReview();
    if (focus !== false) {
      var heading = $('.panel[data-panel="' + n + '"] h2', form);
      if (heading) heading.focus({ preventScroll: false });
      var top = $('.stepper').getBoundingClientRect().top + window.scrollY - 96;
      if (window.scrollY > top) window.scrollTo({ top: top, behavior: 'auto' });
    }
    saveDraft();
  }

  function validateStep(n) {
    if (n === 1) {
      if (!state.practice) {
        setError('practice-error', 'Choose a practice to continue.');
        practiceInputs[0].focus();
        return false;
      }
      setError('practice-error', '');
      return true;
    }
    if (n === 2) {
      if (!state.date) {
        setError('date-error', 'Pick a date.');
        var day = calDays.querySelector('.day:not(:disabled)'); if (day) day.focus();
        return false;
      }
      setError('date-error', '');
      if (!state.slot) {
        setError('slot-error', 'Pick a start time.');
        var slot = slotGrid.querySelector('.slot:not(:disabled)'); if (slot) slot.focus();
        return false;
      }
      setError('slot-error', '');
      return true;
    }
    if (n === 3) return validateDetails(true);
    return true;
  }

  function validateDetails(focusFirst) {
    var firstBad = null;
    var check = function (key, ok, msg) {
      var input = fields[key];
      input.setAttribute('aria-invalid', ok ? 'false' : 'true');
      setError(key + '-error', ok ? '' : msg);
      if (!ok && !firstBad) firstBad = input;
    };
    check('name', state.name.trim().length >= 2, 'Please tell us your name.');
    check('email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(state.email.trim()), 'Enter a valid email address.');
    check('phone', state.phone.trim() === '' || /^[+\d][\d\s().-]{5,}$/.test(state.phone.trim()), 'That phone number does not look right.');
    check('consent', state.consent, 'Please agree to the cancellation policy.');
    if (firstBad && focusFirst) firstBad.focus();
    return !firstBad;
  }

  function next() {
    if (!validateStep(state.step)) return;
    if (state.step < 4) showStep(state.step + 1); else confirmBooking();
  }
  function back() { if (state.step > 1) showStep(state.step - 1); }

  /* ---------- calendar ---------- */
  function renderCalendar() {
    if (!viewMonth) {
      var base = state.date ? parseIso(state.date) : today;
      viewMonth = new Date(base.getFullYear(), base.getMonth(), 1);
    }
    calTitle.textContent = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(viewMonth);
    prevBtn.disabled = viewMonth <= new Date(today.getFullYear(), today.getMonth(), 1);
    nextBtn.disabled = viewMonth >= new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

    calDays.innerHTML = '';
    var lead = (viewMonth.getDay() + 6) % 7; /* Monday-first */
    for (var i = 0; i < lead; i++) {
      var blank = el('span', 'day is-empty'); blank.setAttribute('aria-hidden', 'true'); calDays.appendChild(blank);
    }
    var daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    for (var d = 1; d <= daysInMonth; d++) {
      var date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d);
      var iso = isoDate(date);
      var btn = el('button', 'day', String(d));
      btn.type = 'button';
      btn.dataset.date = iso;
      btn.tabIndex = -1;
      var disabled = date < today || date > maxDate;
      btn.disabled = disabled;
      btn.setAttribute('aria-label', fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + (disabled ? ', unavailable' : ''));
      if (iso === isoDate(today)) btn.classList.add('is-today');
      btn.setAttribute('aria-pressed', iso === state.date ? 'true' : 'false');
      if (iso === state.date) btn.classList.add('is-selected');
      calDays.appendChild(btn);
    }
    var focusable = calDays.querySelector('.day.is-selected:not(:disabled)') || calDays.querySelector('.day:not(:disabled):not(.is-empty)');
    if (focusable) focusable.tabIndex = 0;
    renderSlots();
  }

  function selectDate(iso, focusBtn) {
    state.date = iso;
    $$('.day', calDays).forEach(function (b) {
      var on = b.dataset.date === iso;
      b.classList.toggle('is-selected', on);
      if (b.tagName === 'BUTTON') { b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; }
    });
    setError('date-error', '');
    renderSlots();
    updateSummary();
    saveDraft();
    if (focusBtn) { var b = calDays.querySelector('.day[data-date="' + iso + '"]'); if (b) b.focus(); }
  }

  function moveFocus(fromIso, deltaDays) {
    var target = addDays(parseIso(fromIso), deltaDays);
    if (target < today || target > maxDate) return;
    if (target.getMonth() !== viewMonth.getMonth() || target.getFullYear() !== viewMonth.getFullYear()) {
      viewMonth = new Date(target.getFullYear(), target.getMonth(), 1);
      renderCalendar();
    }
    var btn = calDays.querySelector('.day[data-date="' + isoDate(target) + '"]');
    if (btn && !btn.disabled) {
      $$('.day[tabindex="0"]', calDays).forEach(function (b) { b.tabIndex = -1; });
      btn.tabIndex = 0; btn.focus();
    }
  }

  calDays.addEventListener('click', function (e) {
    var btn = e.target.closest('.day');
    if (!btn || btn.disabled || btn.tagName !== 'BUTTON') return;
    selectDate(btn.dataset.date, false);
  });
  calDays.addEventListener('keydown', function (e) {
    var btn = e.target.closest('.day'); if (!btn) return;
    var delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (delta) { e.preventDefault(); moveFocus(btn.dataset.date, delta); }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      var list = $$('.day:not(:disabled)', calDays).filter(function (b) { return b.tagName === 'BUTTON'; });
      var pick = e.key === 'Home' ? list[0] : list[list.length - 1];
      if (pick) { $$('.day[tabindex="0"]', calDays).forEach(function (b) { b.tabIndex = -1; }); pick.tabIndex = 0; pick.focus(); }
    }
  });
  prevBtn.addEventListener('click', function () { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); renderCalendar(); });
  nextBtn.addEventListener('click', function () { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); renderCalendar(); });

  /* ---------- slots ---------- */
  function renderSlots() {
    slotGrid.innerHTML = '';
    var p = state.practice ? PRACTICES[state.practice] : null;
    if (!p) { slotHint.textContent = 'Choose a practice first.'; return; }
    if (!state.date) { slotHint.textContent = 'Pick a date to see evening times.'; return; }
    slotHint.textContent = fmtDate(parseIso(state.date)) + ' · ' + p.name + ', ' + p.minutes + ' minutes';
    var anyOpen = false;
    p.slots.forEach(function (slot) {
      var status = slotStatus(state.date, slot, state.practice);
      var btn = el('button', 'slot'); btn.type = 'button'; btn.dataset.slot = slot;
      btn.appendChild(el('span', null, fmtTime(slot)));
      btn.appendChild(el('small', null, { mine: 'Booked by you', full: 'Full', past: 'Too soon' }[status] || p.minutes + ' min'));
      btn.disabled = status !== 'open';
      if (btn.disabled && state.slot === slot) state.slot = null;
      var on = state.slot === slot;
      btn.classList.toggle('is-selected', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (!btn.disabled) anyOpen = true;
      slotGrid.appendChild(btn);
    });
    if (!anyOpen) slotGrid.appendChild(el('p', 'empty', 'No times left this evening. Try another day.'));
  }
  slotGrid.addEventListener('click', function (e) {
    var btn = e.target.closest('.slot'); if (!btn || btn.disabled) return;
    state.slot = btn.dataset.slot;
    $$('.slot', slotGrid).forEach(function (b) {
      var on = b === btn; b.classList.toggle('is-selected', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    setError('slot-error', '');
    updateSummary(); saveDraft();
  });

  /* ---------- inputs ---------- */
  practiceInputs.forEach(function (input) {
    input.addEventListener('change', function () {
      if (!input.checked) return;
      state.practice = input.value;
      setError('practice-error', '');
      if (state.slot && PRACTICES[state.practice].slots.indexOf(state.slot) === -1) state.slot = null;
      if (state.step === 2) renderSlots();
      updateSummary(); saveDraft();
    });
  });
  formatInputs.forEach(function (input) {
    input.addEventListener('change', function () { if (input.checked) { state.format = input.value; updateSummary(); saveDraft(); } });
  });
  planSelect.addEventListener('change', function () { state.plan = planSelect.value; updateSummary(); saveDraft(); });

  ['name', 'email', 'phone', 'notes'].forEach(function (key) {
    fields[key].addEventListener('input', function () {
      state[key] = fields[key].value;
      if (fields[key].getAttribute('aria-invalid') === 'true') validateDetails(false);
      saveDraft();
    });
  });
  fields.level.addEventListener('change', function () { state.level = fields.level.value; saveDraft(); });
  fields.consent.addEventListener('change', function () {
    state.consent = fields.consent.checked;
    if (state.consent) { setError('consent-error', ''); fields.consent.setAttribute('aria-invalid', 'false'); }
    saveDraft();
  });

  form.addEventListener('click', function (e) {
    if (e.target.closest('[data-next]')) next();
    else if (e.target.closest('[data-back]')) back();
    else if (e.target.closest('[data-confirm]')) next();
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); next(); });

  /* ---------- review ---------- */
  function renderReview() {
    var p = PRACTICES[state.practice], plan = PLANS[state.plan];
    review.innerHTML = '';
    [
      ['Practice', p.name + ' · ' + p.minutes + ' minutes with ' + p.guide],
      ['Format', FORMATS[state.format] + (state.format === 'studio' ? ' · ' + STUDIO_ADDRESS : ' · link sent by email')],
      ['When', fmtDate(parseIso(state.date), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' at ' + fmtTime(state.slot)],
      ['Name', state.name.trim()],
      ['Email', state.email.trim()],
      ['Phone', state.phone.trim() || '—'],
      ['Experience', LEVELS[state.level]],
      ['Notes', state.notes.trim() || '—'],
      ['Plan', plan.name + ' · $' + plan.price]
    ].forEach(function (row) {
      var wrap = el('div');
      wrap.appendChild(el('dt', null, row[0]));
      wrap.appendChild(el('dd', null, row[1]));
      review.appendChild(wrap);
    });
  }

  /* ---------- confirm ---------- */
  function makeRef() {
    var t = Date.now().toString(36).toUpperCase().slice(-5);
    var r = Math.random().toString(36).toUpperCase().slice(2, 4);
    return 'NOC-' + t + r;
  }

  function confirmBooking() {
    var booking = {
      ref: makeRef(), practice: state.practice, format: state.format, plan: state.plan,
      date: state.date, slot: state.slot,
      name: state.name.trim(), email: state.email.trim(), phone: state.phone.trim(),
      level: state.level, notes: state.notes.trim(),
      createdAt: new Date().toISOString(), status: 'confirmed'
    };
    /* To connect a backend, POST `booking` here and use the server's reference. */
    var list = loadBookings(); list.push(booking); saveBookings(list);
    lastBooking = booking;
    clearDraft();
    renderConfirmation(booking);
    form.hidden = true;
    $('.stepper').hidden = true;
    confirmation.hidden = false;
    $('#conf-title').focus();
    renderSessions();
    announce('Booking ' + booking.ref + ' confirmed.');
  }

  function renderConfirmation(b) {
    var p = PRACTICES[b.practice];
    $('#conf-summary').textContent = p.name + ' with ' + p.guide + ', ' +
      fmtDate(parseIso(b.date), { weekday: 'long', day: 'numeric', month: 'long' }) + ' at ' + fmtTime(b.slot) +
      (b.format === 'studio' ? ', at the studio.' : ', online. Your link arrives by email an hour before.');
    $('#conf-ref').textContent = b.ref;
    var body = 'Hello Nocturne,\n\nI have booked ' + p.name + ' on ' +
      fmtDate(parseIso(b.date), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' at ' + fmtTime(b.slot) +
      ' (' + FORMATS[b.format] + ').\nReference: ' + b.ref + '\nName: ' + b.name + '\n\nThank you.';
    $('#conf-mail').href = 'mailto:' + STUDIO_EMAIL + '?subject=' + encodeURIComponent('Booking ' + b.ref) + '&body=' + encodeURIComponent(body);
  }

  $('#conf-ics').addEventListener('click', function () { if (lastBooking) downloadIcs(lastBooking); });
  $('#conf-again').addEventListener('click', function () {
    Object.assign(state, defaults, { name: state.name, email: state.email, phone: state.phone, level: state.level });
    state.consent = false; state.notes = '';
    applyStateToInputs();
    confirmation.hidden = true;
    form.hidden = false;
    $('.stepper').hidden = false;
    viewMonth = null;
    updateSummary();
    showStep(1);
  });

  /* ---------- calendar export ---------- */
  function buildIcs(b) {
    var p = PRACTICES[b.practice];
    var start = slotDate(b.date, b.slot);
    var end = new Date(start.getTime() + p.minutes * 60000);
    var local = function (d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00'; };
    var utc = function (d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    var esc = function (s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); };
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nocturne Studio//Booking//EN', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:' + b.ref + '@nocturne',
      'DTSTAMP:' + utc(new Date()),
      'DTSTART:' + local(start),
      'DTEND:' + local(end),
      'SUMMARY:' + esc('Nocturne · ' + p.name),
      'DESCRIPTION:' + esc('Guided ' + p.name.toLowerCase() + ' sitting with ' + p.guide + '. Reference ' + b.ref + '.'),
      'LOCATION:' + esc(b.format === 'studio' ? STUDIO_ADDRESS : 'Online (link by email)'),
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
  }
  function downloadIcs(b) {
    var blob = new Blob([buildIcs(b)], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'nocturne-' + b.ref + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- upcoming sessions ---------- */
  function renderSessions() {
    var now = Date.now();
    var list = loadBookings().filter(function (b) {
      return b.status !== 'cancelled' && PRACTICES[b.practice] &&
        slotDate(b.date, b.slot).getTime() + PRACTICES[b.practice].minutes * 60000 > now;
    }).sort(function (a, b) { return (a.date + a.slot).localeCompare(b.date + b.slot); });

    sessionList.innerHTML = '';
    if (!list.length) { sessionList.appendChild(el('p', 'empty', 'No upcoming sessions on this device yet.')); return; }

    list.forEach(function (b) {
      var p = PRACTICES[b.practice];
      var card = el('article', 'session');
      var info = el('div');
      info.appendChild(el('strong', null, p.name + ' with ' + p.guide));
      info.appendChild(el('span', 'when', fmtDate(parseIso(b.date), { weekday: 'long', day: 'numeric', month: 'long' }) + ' at ' + fmtTime(b.slot) + ' · ' + FORMATS[b.format]));
      info.appendChild(el('div', 'ref-tag', b.ref));
      var actions = el('div', 'session-actions');
      var ics = el('button', 'btn btn-ghost btn-sm', 'Add to calendar'); ics.type = 'button';
      ics.addEventListener('click', function () { downloadIcs(b); });
      var cancel = el('button', 'btn btn-danger btn-sm', 'Cancel'); cancel.type = 'button';
      var armed = false, disarm = null;
      cancel.addEventListener('click', function () {
        if (!armed) {
          armed = true; cancel.textContent = 'Confirm cancel';
          disarm = setTimeout(function () { armed = false; cancel.textContent = 'Cancel'; }, 5000);
          return;
        }
        clearTimeout(disarm);
        var all = loadBookings();
        all.forEach(function (x) { if (x.ref === b.ref) x.status = 'cancelled'; });
        saveBookings(all);
        renderSessions();
        if (state.step === 2) renderSlots();
        announce('Booking ' + b.ref + ' cancelled.');
      });
      actions.appendChild(ics); actions.appendChild(cancel);
      card.appendChild(info); card.appendChild(actions);
      sessionList.appendChild(card);
    });
  }

  /* ---------- init ---------- */
  function applyStateToInputs() {
    practiceInputs.forEach(function (i) { i.checked = i.value === state.practice; });
    formatInputs.forEach(function (i) { i.checked = i.value === state.format; });
    planSelect.value = state.plan;
    fields.name.value = state.name; fields.email.value = state.email; fields.phone.value = state.phone;
    fields.level.value = state.level; fields.notes.value = state.notes; fields.consent.checked = state.consent;
  }

  (function init() {
    var draft = loadDraft();
    if (draft && typeof draft === 'object') {
      Object.keys(defaults).forEach(function (k) { if (k in draft) state[k] = draft[k]; });
    }
    /* Deep-link parameters apply on a fresh navigation only, so a reload or
       back/forward keeps whatever the visitor had already chosen. */
    var navEntry = performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
    if (!navEntry || navEntry.type === 'navigate') {
      var params = new URLSearchParams(location.search);
      if (PRACTICES[params.get('practice')] && params.get('practice') !== state.practice) {
        state.practice = params.get('practice');
        state.step = 1;
      }
      if (PLANS[params.get('plan')]) state.plan = params.get('plan');
    }
    if (!PRACTICES[state.practice]) state.practice = null;
    if (!PLANS[state.plan]) state.plan = 'single';
    if (!FORMATS[state.format]) state.format = 'online';
    if (!LEVELS[state.level]) state.level = 'new';
    if (state.date && (parseIso(state.date) < today || parseIso(state.date) > maxDate)) { state.date = null; state.slot = null; }
    if (state.slot && (!state.practice || PRACTICES[state.practice].slots.indexOf(state.slot) === -1)) state.slot = null;

    var step = Number(state.step) || 1;
    if (step >= 2 && !state.practice) step = 1;
    if (step >= 3 && (!state.date || !state.slot)) step = 2;
    if (step === 4 && !validateDetails(false)) step = 3;
    if (step === 3) { ['name', 'email', 'phone', 'consent'].forEach(function (k) { fields[k].setAttribute('aria-invalid', 'false'); setError(k + '-error', ''); }); }

    applyStateToInputs();
    tzNote.textContent = 'Times are shown in your local time zone' +
      (Intl.DateTimeFormat().resolvedOptions().timeZone ? ' (' + Intl.DateTimeFormat().resolvedOptions().timeZone + ')' : '') + '.';
    updateSummary();
    renderSessions();
    showStep(step, false);
  })();
})();
