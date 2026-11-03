/* Lernraum – statische Lern-App. Kein Framework, keine Server-Aufrufe außer den eigenen Dateien. */
'use strict';
(function () {

  // ---------- Konstanten ----------
  const START = '2026-11-03';
  const KEY = 'lernraum.v1';
  const PROJECT_URL = 'https://claude.ai/project/01a19d6e-0d4d-725e-b663-a401ada76378';
  const CAMPUSNET = 'https://campus.mobile-university.de';
  const ECAMPUS = id => 'https://mu-campus.de/course/view.php?id=' + id;
  const HEFT = code => 'https://fhsr.sharepoint.com/sites/files/content/material/' + code + '/' + code + '_INT.pdf';
  const FACTSHEETS = 'https://fhsr.sharepoint.com/sites/files/content/ps/FactSheets_Pruefungen/';
  const EXAM_MAIL = 'examinations@mobile-university.de';
  const INTERVALS = [0, 1, 3, 7, 14, 30];
  const WEEK_DEFAULT = ['we', 'kurz', 'lang', 'kurz', 'lang', 'kurz', 'we']; // Index = getDay()
  const VACATIONS = [['2026-12-21', '2026-12-27']];
  const PASS = 70;
  const MAX_TIMER_SEC = 4 * 3600;
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const WDL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const MON = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
  const MONL = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  // ---------- Hilfen ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const dow = s => parse(s).getDay();
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const mondayOf = s => addDays(s, -((dow(s) + 6) % 7));
  const fmtShort = s => { const d = parse(s); return WD[d.getDay()] + ', ' + d.getDate() + '. ' + MON[d.getMonth()]; };
  const fmtLong = s => { const d = parse(s); return WDL[d.getDay()] + ', ' + d.getDate() + '. ' + MONL[d.getMonth()] + ' ' + d.getFullYear(); };
  const fmtDM = s => { const d = parse(s); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.'; };
  const fmtDMY = s => fmtDM(s) + parse(s).getFullYear();
  const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
  function shuffle(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = b[i]; b[i] = b[j]; b[j] = t; } return b; }
  function hms(sec) { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return h + ':' + pad(m) + ':' + pad(s); }
  function hm(sec) { sec = Math.max(0, Math.round(sec / 60)); return Math.floor(sec / 60) + ':' + pad(sec % 60); }
  function hoursTxt(sec) { return (sec / 3600).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' Std'; }
  function minTxt(sec) { const m = Math.round(sec / 60); return m < 60 ? m + ' Min' : hm(sec) + ' Std'; }

  function todayStr() {
    try {
      const p = new URLSearchParams(location.search).get('heute');
      if (p && /^\d{4}-\d\d-\d\d$/.test(p)) return p;
    } catch (e) { /* ignorieren */ }
    return ymd(new Date());
  }
  let TODAY = todayStr();

  // ---------- Daten ----------
  const D = { QUEUE: [], MODS: {}, UNITS: {}, MAP_SECTIONS: {}, EVENTS: [], EXAMS: [], DAYTYPES: {}, COURSE_IDS: {}, sections: {}, books: {}, ecampus: {}, inhalte: { media: {}, quiz: [], karten: [] } };
  const jsonCache = {};
  function getJSON(url) {
    if (!jsonCache[url]) {
      jsonCache[url] = fetch(url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(url + ': ' + r.status); return r.json(); })
        .catch(e => { delete jsonCache[url]; throw e; });
    }
    return jsonCache[url];
  }
  const itemById = id => D.QUEUE.find(x => x.id === id);
  const modShort = mod => (D.MODS[mod] && D.MODS[mod].short) || mod;
  const modColor = mod => (D.MODS[mod] && D.MODS[mod].c) || 'var(--accent)';
  const itemLabel = it => it ? modShort(it.mod) + ' · ' + it.title : '';
  const hasQuiz = id => D.inhalte.quiz.indexOf(id) >= 0;
  const hasCards = id => D.inhalte.karten.indexOf(id) >= 0;
  const mediaOf = id => D.inhalte.media[id] || null;

  // ---------- Zustand (localStorage) ----------
  function defaults() {
    return {
      v: 1,
      done: {},        // itemId -> Datum erledigt
      dayType: {},     // Datum -> Tagestyp (nur Abweichungen)
      skip: {},        // Datum -> true ("Heute fällt aus")
      extra: {},       // Datum -> zusätzliche Blöcke (vorgezogen)
      later: {},       // Datum -> {itemId: true} ("für heute aufhören")
      prog: {},        // itemId -> {step, read, claude, task}
      quiz: {},        // itemId -> {last, best, passed, tries, date}
      time: {},        // Datum -> Sekunden
      itemTime: {},    // itemId -> Sekunden
      timer: { running: false, startedAt: 0, session: 0, item: null, day: '' },
      cards: {},       // cardId -> {unit, mod, f, b, box, due}
      settings: { goalH: 13, theme: 'auto' }
    };
  }
  function merge(base, o) {
    if (!isObj(o)) return base;
    Object.keys(base).forEach(k => {
      if (!(k in o)) return;
      if (isObj(base[k])) { if (isObj(o[k])) base[k] = Object.assign(base[k], o[k]); }
      else if (typeof base[k] === typeof o[k]) base[k] = o[k];
    });
    return base;
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return merge(defaults(), JSON.parse(raw));
    } catch (e) { /* kaputter Speicher: frisch starten */ }
    return defaults();
  }
  let S = load();
  let saveWarned = false;
  let planCache = null;
  function save() {
    planCache = null;
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { if (!saveWarned) { saveWarned = true; toast('Speichern im Browser geht gerade nicht. Nutze Export.'); } }
  }

  // ---------- Toast ----------
  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  // ---------- Zwischenablage ----------
  function copyText(text) {
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
        const ok = document.execCommand('copy'); document.body.removeChild(ta); return ok;
      } catch (e) { return false; }
    };
    try {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text).then(() => true, () => fallback());
      }
    } catch (e) { /* weiter mit Fallback */ }
    return Promise.resolve(fallback());
  }
  function copyAndToast(text) {
    copyText(text).then(ok => toast(ok ? 'Kopiert: ' + (text.length > 48 ? text.slice(0, 48) + '…' : text) : 'Kopieren ging nicht – Text bitte markieren.'));
  }

  // ---------- Planlogik ----------
  function defaultType(d) {
    for (const v of VACATIONS) if (d >= v[0] && d <= v[1]) return 'off';
    return WEEK_DEFAULT[dow(d)];
  }
  const dayType = d => S.dayType[d] || defaultType(d);
  function blocksOf(d) {
    if (d < START || S.skip[d]) return { learn: 0, puffer: 0 };
    const t = D.DAYTYPES[dayType(d)];
    const base = t ? t.s : 0;
    const puffer = (dow(d) === 5 && base > 0) ? 1 : 0;
    // Vorgezogene Extra-Blöcke zählen nur am Tag selbst (sonst würde Nicht-Geschafftes später als Rückstand zählen)
    return { learn: base - puffer + (d === TODAY ? (S.extra[d] || 0) : 0), puffer };
  }

  function computePlan() {
    if (planCache && planCache.today === TODAY) return planCache;
    const Q = D.QUEUE;
    const days = {};
    const finish = {};
    const ensure = d => days[d] || (days[d] = { entries: [], pufferFree: false });
    const placed = {};
    function push(d, it, puffer) {
      const day = ensure(d);
      placed[it.id] = (placed[it.id] || 0) + 1;
      const last = day.entries[day.entries.length - 1];
      if (last && last.id === it.id) { last.to = placed[it.id]; return; }
      day.entries.push({ id: it.id, from: placed[it.id], to: placed[it.id], total: it.slots, puffer: !!puffer });
    }
    // 1) Soll für vergangene Tage: QUEUE der Reihe nach auf die Lernblöcke
    const soll = new Set();
    let qi = 0, left = Q.length ? Q[0].slots : 0;
    for (let d = START; d < TODAY; d = addDays(d, 1)) {
      let n = blocksOf(d).learn;
      while (n > 0 && qi < Q.length) {
        push(d, Q[qi]); soll.add(Q[qi].id); left--; n--;
        if (left === 0) { qi++; left = qi < Q.length ? Q[qi].slots : 0; }
      }
    }
    const backlog = Q.filter(x => soll.has(x.id) && !S.done[x.id]).map(x => x.id);
    const backlogSet = new Set(backlog);
    // 2) Ab heute: erledigte fallen raus, Rest der Reihe nach.
    //    Heute wird so verteilt wie am Tagesbeginn (heute Erledigtes zählt mit), damit "Heute dran" stabil bleibt.
    Object.keys(placed).forEach(k => { delete placed[k]; });
    const first = TODAY < START ? START : TODAY;
    const doneToday = Q.filter(x => S.done[x.id] === TODAY);
    const fq = Q.filter(x => !S.done[x.id] || (first === TODAY && S.done[x.id] === TODAY)).map(x => ({ it: x, left: x.slots }));
    let fi = 0, backlogStarted = 0;
    function placeNext(d, puffer) {
      while (fi < fq.length && d !== TODAY && S.done[fq[fi].it.id]) fi++;
      if (fi >= fq.length) return false;
      const f = fq[fi];
      if (f.left === f.it.slots && backlogSet.has(f.it.id)) backlogStarted++;
      push(d, f.it, puffer); f.left--;
      if (f.left === 0) { finish[f.it.id] = d; fi++; }
      return true;
    }
    const openLeft = () => fq.slice(fi).some(f => !S.done[f.it.id]);
    let d = first, guard = 0;
    while (guard < 1500) {
      const b = blocksOf(d);
      let n = b.learn;
      while (n > 0 && placeNext(d)) n--;
      if (b.puffer) {
        if (!(backlogStarted < backlog.length && placeNext(d, true))) ensure(d).pufferFree = true;
      }
      if (d === TODAY) {
        const here = new Set(((days[TODAY] || {}).entries || []).map(e => e.id));
        doneToday.forEach(x => { if (!here.has(x.id)) ensure(TODAY).entries.push({ id: x.id, from: 1, to: x.slots, total: x.slots, puffer: false }); });
      }
      if (!openLeft()) break;
      d = addDays(d, 1); guard++;
    }
    Q.forEach(x => { if (S.done[x.id]) finish[x.id] = S.done[x.id]; });
    planCache = { today: TODAY, days, finish, backlog, end: d };
    return planCache;
  }

  function todayEntries() {
    const p = computePlan();
    return ((p.days[TODAY] || {}).entries || []);
  }
  function currentItem() {
    if (S.later[TODAY]) return null;
    const e = todayEntries().find(x => !S.done[x.id]);
    return e ? itemById(e.id) : null;
  }
  function nextExam() {
    const open = D.EXAMS.filter(e => !S.done[e.id]).sort((a, b) => a.goal < b.goal ? -1 : 1);
    return open[0] || null;
  }
  function nextEvent() {
    return D.EVENTS.filter(e => e.d >= TODAY).sort((a, b) => a.d < b.d ? -1 : 1)[0] || null;
  }
  function entryLabel(e) {
    const it = itemById(e.id);
    let t = itemLabel(it);
    if (e.total > 1 && !(e.from === 1 && e.to === e.total)) t += ' (Teil ' + (e.from === e.to ? e.from : e.from + '–' + e.to) + '/' + e.total + ')';
    return t;
  }

  // ---------- Erledigt & Karten ----------
  function addUnitCards(unitId) {
    if (!hasCards(unitId)) return Promise.resolve(0);
    return getJSON('data/karten/' + unitId + '.json').then(j => {
      let n = 0;
      (j.cards || []).forEach((c, i) => {
        const id = unitId + '#' + i;
        if (!S.cards[id]) { S.cards[id] = { unit: unitId, mod: unitId.split('-')[0], f: c.f, b: c.b, box: 0, due: TODAY }; n++; }
      });
      save(); return n;
    }).catch(() => { toast('Karten konnten nicht geladen werden.'); return 0; });
  }
  function markDone(id, date) {
    S.done[id] = date || TODAY;
    save();
    return addUnitCards(id);
  }
  function dueCards(mod) {
    return Object.keys(S.cards).filter(id => {
      const c = S.cards[id];
      return c.due <= TODAY && (!mod || mod === 'ALL' || c.mod === mod);
    });
  }

  // ---------- Timer ----------
  function runningSec() {
    if (!S.timer.running) return 0;
    return Math.min(MAX_TIMER_SEC, Math.max(0, Math.floor((Date.now() - S.timer.startedAt) / 1000)));
  }
  function flushTimer() {
    if (!S.timer.running) return;
    const sec = runningSec();
    if (sec > 0) {
      S.time[TODAY] = (S.time[TODAY] || 0) + sec;
      if (S.timer.item) S.itemTime[S.timer.item] = (S.itemTime[S.timer.item] || 0) + sec;
      S.timer.session = (S.timer.session || 0) + sec;
    }
    S.timer.startedAt = Date.now();
  }
  function timerStart(itemId) {
    if (S.timer.running) return;
    if (S.timer.day !== TODAY) S.timer.session = 0;
    S.timer.running = true; S.timer.startedAt = Date.now(); S.timer.day = TODAY; S.timer.item = itemId || S.timer.item || null;
    save(); updateTimerUI();
  }
  function timerPause() { flushTimer(); S.timer.running = false; save(); updateTimerUI(); }
  function timerStop() { flushTimer(); S.timer.running = false; S.timer.session = 0; save(); updateTimerUI(); toast('Timer gestoppt. Gut gemacht.'); }
  function setTimerItem(id) {
    if (S.timer.item === id) return;
    if (S.timer.running) flushTimer();
    S.timer.item = id; save();
  }
  const todaySec = () => (S.time[TODAY] || 0) + runningSec();
  function weekSec(monday) {
    let s = 0;
    for (let i = 0; i < 7; i++) { const d = addDays(monday, i); s += (S.time[d] || 0); }
    if (mondayOf(TODAY) === monday) s += runningSec();
    return s;
  }
  function updateTimerUI() {
    const sess = (S.timer.session || 0) + runningSec();
    $$('[data-t="session"]').forEach(e => { e.textContent = hms(sess); });
    $$('[data-t="today"]').forEach(e => { e.textContent = hm(todaySec()) + ' Std'; });
    $$('[data-t="week"]').forEach(e => { e.textContent = hoursTxt(weekSec(mondayOf(TODAY))); });
    const pill = $('#timer-pill'); if (pill) pill.hidden = !S.timer.running;
    $$('[data-timer-btn]').forEach(b => {
      const k = b.dataset.timerBtn;
      const started = S.timer.running || (S.timer.session || 0) > 0;
      b.hidden = k === 'start' ? started : k === 'pause' ? !S.timer.running : k === 'resume' ? (S.timer.running || !started) : !started;
    });
    if (flow.id) updateFlowFoot();
  }

  // ---------- Navigation ----------
  const PAGES = ['heute', 'plan', 'karten', 'uni'];
  let page = 'heute';
  function show(p) {
    if (PAGES.indexOf(p) < 0) p = 'heute';
    page = p;
    PAGES.forEach(x => { $('#page-' + x).hidden = x !== p; });
    $$('.tabbar button').forEach(b => { if (b.dataset.page === p) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    renderPage(p);
    if (location.hash !== '#' + p) { try { history.replaceState(null, '', location.pathname + location.search + '#' + p); } catch (e) { /* egal */ } }
    window.scrollTo(0, 0);
  }
  function renderPage(p) {
    if (p === 'heute') renderHeute();
    else if (p === 'plan') renderPlan();
    else if (p === 'karten') renderKarten();
    else if (p === 'uni') renderUni();
  }
  function refresh() { renderPage(page); updateTimerUI(); }

  // ======================================================
  // HEUTE
  // ======================================================
  const flow = { id: null, steps: [], el: null, quiz: null, summary: null };
  let summary = null;

  function renderHeute() {
    const root = $('#page-heute');
    if (!root.dataset.built) {
      root.innerHTML = '<div class="card hero" id="h-top"></div><div id="h-flow"></div><div id="h-after"></div>';
      root.dataset.built = '1';
    }
    renderTop();
    renderFlowArea();
    renderAfter();
  }

  function renderTop() {
    const p = computePlan();
    const entries = todayEntries();
    const t = D.DAYTYPES[dayType(TODAY)];
    const ex = nextExam();
    let html = '<div class="hero-row"><div class="date">' + esc(fmtLong(TODAY)) + '</div>' +
      '<span class="badge">' + esc(t ? t.l : '') + '</span>' + (S.skip[TODAY] ? '<span class="badge warn">fällt aus</span>' : '') + '</div>';
    html += '<div class="facts">';
    const list = entries.map(e => (S.done[e.id] ? '✓ ' : '') + entryLabel(e));
    let dran;
    if (TODAY < START) dran = esc('Start ist am ' + fmtDMY(START) + '.');
    else if (!list.length) dran = esc(S.skip[TODAY] ? 'Heute nichts. Der Plan ist verschoben.' : 'Nichts geplant. Freier Tag.');
    else dran = list.map(esc).join('<br>');
    const pd = p.days[TODAY];
    if (pd && pd.entries.some(e => e.puffer)) dran += '<br><span class="muted small">inkl. Puffer zum Aufholen</span>';
    else if (pd && pd.pufferFree) dran += '<br><span class="muted small">Puffer-Block: Karten wiederholen</span>';
    html += '<div class="fact wide"><span class="k">Heute dran</span><span class="v">' + dran + '</span></div>';
    if (ex) {
      const n = diffDays(TODAY, ex.goal);
      const it = itemById(ex.id);
      const when = n > 0 ? 'noch <span class="countdown">' + n + '</span> ' + (n === 1 ? 'Tag' : 'Tage') : n === 0 ? '<span class="countdown">heute</span>' : 'Ziel war der ' + fmtDM(ex.goal);
      html += '<div class="fact"><span class="k">Nächste Prüfung</span><span class="v">' + esc(it ? it.title : ex.id) + '<br>' + when + ' · Ziel ' + esc(fmtDMY(ex.goal)) + '</span></div>';
    }
    if (p.backlog.length) {
      const names = p.backlog.slice(0, 3).map(id => esc(itemLabel(itemById(id)))).join(', ');
      html += '<div class="fact calm"><span class="k">Rückstand</span><span class="v">' + p.backlog.length + ' ' + (p.backlog.length === 1 ? 'Einheit' : 'Einheiten') + ' – kein Stress, rutscht nach vorne und wird über die Puffer aufgeholt.<br><span class="small muted">' + names + (p.backlog.length > 3 ? ' …' : '') + '</span></span></div>';
    }
    html += '</div>';
    $('#h-top').innerHTML = html;
  }

  function renderFlowArea() {
    const box = $('#h-flow');
    if (summary) {
      if (flow.id !== 'summary') { flow.id = 'summary'; box.innerHTML = summaryHTML(summary); bindSummary(box); }
      return;
    }
    const cur = currentItem();
    if (!cur) {
      const key = 'none:' + TODAY + ':' + (S.skip[TODAY] ? 's' : '') + todayEntries().length + ':' + (S.extra[TODAY] || 0);
      flow.id = key;
      box.innerHTML = emptyHTML();
      bindEmpty(box);
      return;
    }
    if (flow.id !== cur.id) buildFlow(cur, box);
    else updateFlow();
  }

  function emptyHTML() {
    const entries = todayEntries();
    const allDone = entries.length && entries.every(e => S.done[e.id]);
    const rest = D.QUEUE.some(x => !S.done[x.id]);
    let msg, sub = '';
    if (TODAY < START) { msg = 'Bald geht’s los.'; sub = 'Dein Plan startet am ' + fmtLong(START) + '.'; }
    else if (S.skip[TODAY]) { msg = 'Heute fällt aus.'; sub = 'Alles dahinter ist automatisch verschoben. Erhol dich.'; }
    else if (allDone) { msg = 'Fertig für heute.'; sub = 'Stark. Alles, was heute dran war, ist erledigt.'; }
    else if (entries.length) { msg = 'Für heute pausiert.'; sub = 'Der Rest kommt morgen wieder nach vorne.'; }
    else { msg = 'Heute ist frei.'; sub = 'Kein Lernblock geplant. Karten wiederholen geht immer.'; }
    let html = '<div class="card done-msg"><div class="big">' + esc(msg) + '</div><p class="muted">' + esc(sub) + '</p>';
    if (S.skip[TODAY]) html += '<div class="btn-row"><button class="btn" id="btn-unskip" type="button">Doch nicht – heute lernen</button></div>';
    else if (TODAY >= START && rest && !S.later[TODAY]) html += '<div class="btn-row"><button class="btn soft" id="btn-pull" type="button">Noch eine Einheit vorziehen</button></div>';
    if (S.later[TODAY] && !S.skip[TODAY] && !allDone) html += '<div class="btn-row"><button class="btn primary" id="btn-resume" type="button">Doch weitermachen</button></div>';
    html += '</div>';
    return html;
  }
  function bindEmpty(box) {
    const u = $('#btn-unskip', box); if (u) u.onclick = () => { delete S.skip[TODAY]; save(); toast('Okay, heute wird gelernt.'); refresh(); };
    const p = $('#btn-pull', box); if (p) p.onclick = () => { S.extra[TODAY] = (S.extra[TODAY] || 0) + 1; save(); refresh(); };
    const r = $('#btn-resume', box); if (r) r.onclick = () => { delete S.later[TODAY]; save(); refresh(); };
  }

  function renderAfter() {
    const due = dueCards('ALL').length;
    let html = '<div class="card"><div class="hero-row" style="justify-content:space-between"><div><b>Fällige Karteikarten: ' + due + '</b>' +
      (due ? '' : '<div class="small muted">Gerade nichts fällig.</div>') + '</div>' +
      '<button class="btn ' + (due ? 'soft' : '') + '" id="btn-cards" type="button"' + (due ? '' : ' disabled') + '>Wiederholen</button></div></div>';
    if (TODAY >= START && !S.skip[TODAY]) {
      html += '<div class="btn-row"><button class="btn danger" id="btn-skip" type="button">Heute fällt aus</button></div>';
    }
    const box = $('#h-after');
    box.innerHTML = html;
    $('#btn-cards', box).onclick = () => { cardState.filter = 'ALL'; show('karten'); };
    const sk = $('#btn-skip', box);
    if (sk) sk.onclick = () => {
      if (!window.confirm('Heute fällt aus? Alles Geplante rutscht automatisch nach hinten.')) return;
      if (S.timer.running) timerPause();
      S.skip[TODAY] = true; save(); toast('Plan verschoben.'); refresh();
    };
  }

  // ----- Geführter Ablauf -----
  const STEP_TITLES = { checkin: 'Einchecken', watch: 'Anschauen', read: 'Lesen und mitschreiben', quiz: 'Quiz', claude: 'Mitschrift-Check mit Claude', finish: 'Unit abschließen', task: 'Aufgabe' };

  function stepsFor(it) {
    if (it.kind === 'unit') return ['checkin'].concat(mediaOf(it.id) ? ['watch'] : [], ['read', 'quiz', 'claude', 'finish']);
    return ['checkin', 'task', 'finish'];
  }
  function progOf(id) {
    if (!isObj(S.prog[id])) S.prog[id] = {};
    return S.prog[id];
  }

  function buildFlow(it, box) {
    flow.id = it.id; flow.item = it; flow.steps = stepsFor(it); flow.quiz = null;
    const pr = progOf(it.id);
    if (flow.steps.indexOf(pr.step) < 0) pr.step = flow.steps[0];
    setTimerItem(it.id);
    const isUnit = it.kind === 'unit';
    let html = '<div class="card flow" data-item="' + esc(it.id) + '"><div class="flow-head"><span class="mdot" style="--c:' + esc(modColor(it.mod)) + '"></span><div>' +
      '<div class="eyebrow">Jetzt dran · ' + esc((D.MODS[it.mod] || {}).name || it.mod) + '</div><h2>' + esc(it.title) + '</h2></div></div><ol class="steps">';
    flow.steps.forEach((k, i) => {
      let title = STEP_TITLES[k];
      if (k === 'finish' && !isUnit) title = 'Abschließen';
      if (k === 'quiz' && !hasQuiz(it.id)) title = 'Quiz kommt noch';
      html += '<li class="step" data-step="' + k + '"><button class="step-head" type="button"><span class="step-num">' + (i + 1) + '</span><span class="step-title">' + esc(title) + '</span><span class="step-state"></span></button>' +
        '<div class="step-body">' + stepBody(k, it) + '</div></li>';
    });
    html += '</ol><div class="flow-foot"><p class="hint" id="flow-hint"></p><button class="btn primary big" id="btn-next" type="button">Weiter</button>' +
      '<button class="link" id="btn-later" type="button">Für heute aufhören</button></div></div>';
    box.innerHTML = html;
    flow.el = $('.flow', box);
    bindFlow(it);
    updateFlow();
    if (hasQuiz(it.id)) initQuiz(it);
  }

  function stepBody(k, it) {
    const pr = progOf(it.id);
    if (k === 'checkin') {
      return '<div class="timer"><div class="timer-big" data-t="session">0:00:00</div>' +
        '<div class="timer-sub">Heute <b data-t="today">0:00 Std</b> · Woche <b data-t="week">0,0 Std</b> von ' + esc(S.settings.goalH) + ' Std</div>' +
        '<div class="btn-row"><button class="btn primary" type="button" data-timer-btn="start">Start</button>' +
        '<button class="btn" type="button" data-timer-btn="pause">Pause</button>' +
        '<button class="btn primary" type="button" data-timer-btn="resume">Weiter</button>' +
        '<button class="btn" type="button" data-timer-btn="stop">Fertig</button></div></div>' +
        '<p class="small muted" style="text-align:center">Handy weg, Timer an. Dann geht’s los.</p>';
    }
    if (k === 'watch') {
      const m = mediaOf(it.id);
      return '<p class="small muted">Erst einen Überblick holen. Video oder Podcast, wie du magst. Der Podcast läuft auch weiter, wenn du zum nächsten Schritt gehst.</p>' +
        '<div class="seg" role="tablist"><button type="button" role="tab" data-media="video" aria-selected="true">Video</button><button type="button" role="tab" data-media="audio" aria-selected="false">Podcast</button></div>' +
        '<div data-pane="video"><video controls playsinline preload="metadata" src="' + esc(m.video) + '"></video></div>' +
        '<div data-pane="audio" hidden><audio controls preload="metadata" src="' + esc(m.audio) + '"></audio></div>';
    }
    if (k === 'read') {
      const secs = ((D.MAP_SECTIONS[it.mod] || [])[it.i - 1]) || [];
      const books = [];
      let li = '';
      secs.forEach(sid => {
        const code = sid.split('-')[0];
        if (books.indexOf(code) < 0) books.push(code);
        const s = D.sections[sid];
        li += '<li><span class="num">' + esc(code) + ' · ' + esc(s ? s.num : sid.split('-')[1]) + '</span>' + esc(s ? s.title : '') + '</li>';
      });
      let btns = books.map(c => '<a class="btn" target="_blank" rel="noopener" href="' + esc(HEFT(c)) + '">Studienheft ' + esc(c) + ' öffnen</a>').join('');
      const eu = D.ecampus[it.id] || ECAMPUS(D.COURSE_IDS[it.mod]);
      btns += '<a class="btn" target="_blank" rel="noopener" href="' + esc(eu) + '">Unit im E-Campus öffnen</a>';
      return '<p class="small muted">Diese Kapitel gehören zur Unit:</p><ul class="chapters">' + (li || '<li class="muted">Keine Kapitel hinterlegt.</li>') + '</ul>' +
        '<div class="btn-row">' + btns + '</div>' +
        '<div class="note">Schreib mit, du brauchst die Mitschrift gleich.</div>' +
        '<label class="check' + (pr.read ? ' on' : '') + '"><input type="checkbox" data-flag="read"' + (pr.read ? ' checked' : '') + '> Gelesen und mitgeschrieben</label>';
    }
    if (k === 'quiz') {
      if (!hasQuiz(it.id)) return '<p class="muted">Für diese Unit gibt es noch kein Quiz. Der Schritt wird übersprungen.</p>';
      return '<div class="quiz" id="quiz-box"><p class="muted">Lade Quiz …</p></div>';
    }
    if (k === 'claude') {
      return '<p>Fotografier deine Mitschrift. Claude prüft sie und fragt dich ab.</p>' +
        '<a class="btn primary block" id="btn-claude" target="_blank" rel="noopener" href="' + esc(PROJECT_URL) + '">Text kopieren + Claude öffnen</a>' +
        '<p class="small muted">Kopiert: „' + esc(mitschriftText(it)) + '“ – in Claude einfügen, dann Fotos dazu.</p>' +
        '<label class="check' + (pr.claude ? ' on' : '') + '"><input type="checkbox" data-flag="claude"' + (pr.claude ? ' checked' : '') + '> Erledigt</label>';
    }
    if (k === 'task') return taskBody(it, pr);
    if (k === 'finish') {
      const nC = hasCards(it.id) ? ' Die Karteikarten der Unit kommen automatisch in deinen Stapel.' : '';
      return '<p>' + (it.kind === 'unit' ? 'Alles durch? Dann schließ die Unit ab.' + nC : 'Fertig damit? Dann abschließen.') + '</p>' +
        '<button class="btn primary big" type="button" id="btn-finish">' + (it.kind === 'unit' ? 'Unit abschließen' : 'Abschließen') + '</button>' +
        (it.slots > 1 ? '<p class="small muted">Dauert mehrere Blöcke? Dann unten „Für heute aufhören“ – morgen geht’s hier weiter.</p>' : '');
    }
    return '';
  }

  function taskBody(it, pr) {
    const id = it.id;
    const rule = (D.EXAMS.find(e => e.id === id) || {}).rule;
    let txt, links = [];
    if (/-TEST$/.test(id)) {
      txt = 'Schreib den Online-Test im E-Campus. Unterlagen sind erlaubt, Hilfe anderer Personen nicht.' + (rule ? ' Regel: ' + rule : '');
      links.push(['E-Campus: Prüfungen', ECAMPUS(8368)], ['E-Campus: ' + modShort(it.mod), ECAMPUS(D.COURSE_IDS[it.mod])], ['Fact Sheets Prüfungen', FACTSHEETS]);
    } else if (/-UEB$/.test(id)) {
      txt = 'Übungstest mit Claude: Lass dich im Testformat abfragen und wiederhole danach die Lücken.';
    } else if (/-WDH$/.test(id)) {
      txt = 'Wiederhole alle fälligen Karteikarten dieses Moduls.';
    } else {
      txt = 'Arbeite an deiner Prüfungsleistung: ' + it.title + '.' + (rule ? ' Hinweis: ' + rule : '');
      links.push(['Fact Sheets Prüfungen', FACTSHEETS], ['E-Campus: ' + modShort(it.mod), ECAMPUS(D.COURSE_IDS[it.mod])]);
    }
    let html = '<p>' + esc(txt) + '</p><div class="btn-row">';
    links.forEach(l => { html += '<a class="btn" target="_blank" rel="noopener" href="' + esc(l[1]) + '">' + esc(l[0]) + '</a>'; });
    if (/-UEB$/.test(id)) html += '<a class="btn primary" target="_blank" rel="noopener" data-copy="' + esc(testText(it.mod)) + '" href="' + esc(PROJECT_URL) + '">Text kopieren + Claude öffnen</a>';
    if (/-WDH$/.test(id) || /-UEB$/.test(id)) html += '<button class="btn soft" type="button" data-goto-cards="' + esc(it.mod) + '">Zu den Karten</button>';
    if (!/-TEST$|-UEB$|-WDH$/.test(id)) html += '<a class="btn" target="_blank" rel="noopener" href="' + esc(PROJECT_URL) + '">Claude öffnen</a>';
    html += '</div><label class="check' + (pr.task ? ' on' : '') + '"><input type="checkbox" data-flag="task"' + (pr.task ? ' checked' : '') + '> Erledigt</label>';
    return html;
  }

  function mitschriftText(it) { return 'Mitschrift-Check: ' + modShort(it.mod) + ' ' + it.title + '. Fotos kommen gleich.'; }
  function testText(mod) {
    const units = D.QUEUE.filter(x => x.mod === mod && x.kind === 'unit');
    const done = units.filter(x => S.done[x.id]);
    const name = (D.MODS[mod] || {}).name || mod;
    let t = 'Test-Sitzung ' + name + '. ';
    if (done.length) {
      t += 'Erledigt: ' + done.map(x => 'U' + x.i).join(', ') + '. ';
      const q = done.filter(x => S.quiz[x.id]).map(x => 'U' + x.i + ' ' + S.quiz[x.id].best + ' %');
      if (q.length) t += 'Quiz-Ergebnisse (Lernraum): ' + q.join(', ') + '. ';
    } else t += 'Noch keine Unit erledigt. ';
    return t + 'Frag mich im Testformat ab.';
  }
  function replanText() {
    const p = computePlan();
    let t = 'Plan neu machen, ich hänge hinterher. Stand ' + fmtDMY(TODAY) + ': ';
    t += p.backlog.length ? 'Rückstand ' + p.backlog.length + ' (' + p.backlog.map(id => itemLabel(itemById(id))).join('; ') + '). ' : 'Laut Lernraum kein Rückstand. ';
    const ex = D.EXAMS.map(e => { const f = p.finish[e.id]; return modShort(e.mod) + ': Ziel ' + fmtDM(e.goal) + ', voraussichtlich ' + (f ? fmtDM(f) : '?'); });
    return t + 'Prüfungen: ' + ex.join('; ') + '.';
  }

  function bindFlow(it) {
    const el = flow.el;
    $$('.step-head', el).forEach(h => {
      h.onclick = () => {
        const k = h.parentNode.dataset.step;
        const pr = progOf(it.id);
        if (flow.steps.indexOf(k) < flow.steps.indexOf(pr.step) && !(k === 'quiz' && !hasQuiz(it.id))) {
          pauseVideo(); pr.step = k; save(); updateFlow(); scrollToStep(k);
        }
      };
    });
    $$('[data-timer-btn]', el).forEach(b => {
      b.onclick = () => {
        const k = b.dataset.timerBtn;
        if (k === 'start' || k === 'resume') timerStart(it.id);
        else if (k === 'pause') timerPause();
        else timerStop();
      };
    });
    $$('[data-media]', el).forEach(b => {
      b.onclick = () => {
        const m = b.dataset.media;
        $$('[data-media]', el).forEach(x => x.setAttribute('aria-selected', x === b ? 'true' : 'false'));
        $$('[data-pane]', el).forEach(p => {
          const on = p.dataset.pane === m;
          p.hidden = !on;
          if (!on) { const me = $('video,audio', p); if (me && !me.paused) me.pause(); }
        });
      };
    });
    $$('[data-flag]', el).forEach(c => {
      c.onchange = () => {
        progOf(it.id)[c.dataset.flag] = c.checked;
        c.parentNode.classList.toggle('on', c.checked);
        save(); updateFlowFoot();
      };
    });
    const cl = $('#btn-claude', el);
    if (cl) cl.addEventListener('click', () => { copyAndToast(mitschriftText(it)); });
    $$('[data-copy]', el).forEach(a => a.addEventListener('click', () => copyAndToast(a.dataset.copy)));
    $$('[data-goto-cards]', el).forEach(b => { b.onclick = () => { cardState.filter = b.dataset.gotoCards; cardState.session = null; show('karten'); }; });
    $('#btn-next', el).onclick = () => next(it);
    $('#btn-later', el).onclick = () => {
      if (S.timer.running) timerPause();
      S.later[TODAY] = true; save();
      toast('Okay. Dein Fortschritt ist gespeichert.'); refresh();
    };
    const fin = $('#btn-finish', el);
    if (fin) fin.onclick = () => finishItem(it);
  }

  function pauseVideo() { const v = flow.el && $('video', flow.el); if (v && !v.paused) v.pause(); }
  function scrollToStep(k) {
    const li = flow.el && $('[data-step="' + k + '"]', flow.el);
    if (li && li.scrollIntoView) { try { li.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { li.scrollIntoView(); } }
  }

  function canAdvance(it, k) {
    const pr = progOf(it.id);
    if (k === 'checkin') return (S.timer.running || todaySec() > 0) ? '' : 'Starte zuerst den Timer.';
    if (k === 'watch') return '';
    if (k === 'read') return pr.read ? '' : 'Hak ab, wenn du gelesen und mitgeschrieben hast.';
    if (k === 'quiz') return (!hasQuiz(it.id) || (S.quiz[it.id] && S.quiz[it.id].passed)) ? '' : 'Bestehe das Quiz (ab ' + PASS + ' %).';
    if (k === 'claude') return pr.claude ? '' : 'Hak ab, wenn der Check erledigt ist.';
    if (k === 'task') return pr.task ? '' : 'Hak ab, wenn die Aufgabe erledigt ist.';
    return '';
  }

  function next(it) {
    const pr = progOf(it.id);
    let idx = flow.steps.indexOf(pr.step);
    if (canAdvance(it, pr.step)) return;
    if (pr.step === 'watch') pauseVideo();
    idx++;
    if (flow.steps[idx] === 'quiz' && !hasQuiz(it.id)) idx++;
    if (idx >= flow.steps.length) return;
    pr.step = flow.steps[idx]; save();
    updateFlow(); scrollToStep(pr.step);
  }

  function updateFlow() {
    if (!flow.el || !flow.item) return;
    const it = flow.item;
    const pr = progOf(it.id);
    const ci = flow.steps.indexOf(pr.step);
    $$('.step', flow.el).forEach(li => {
      const k = li.dataset.step; const i = flow.steps.indexOf(k);
      const skipped = k === 'quiz' && !hasQuiz(it.id);
      li.classList.toggle('current', i === ci);
      li.classList.toggle('done', i < ci && !skipped);
      li.classList.toggle('skipped', skipped);
      const st = $('.step-state', li);
      st.textContent = skipped ? 'übersprungen' : i < ci ? '✓ erledigt' : '';
      $('.step-num', li).textContent = (i < ci && !skipped) ? '✓' : String(i + 1);
    });
    updateTimerUI();
    updateFlowFoot();
  }
  function updateFlowFoot() {
    if (!flow.el || !flow.item || !document.body.contains(flow.el)) return;
    const it = flow.item;
    const pr = progOf(it.id);
    const btn = $('#btn-next', flow.el);
    const hint = $('#flow-hint', flow.el);
    if (pr.step === 'finish') { btn.hidden = true; hint.textContent = ''; return; }
    btn.hidden = false;
    const why = canAdvance(it, pr.step);
    btn.disabled = !!why;
    hint.textContent = why || (pr.step === 'watch' ? 'Optional. Weiter, wenn du fertig bist.' : '');
  }

  function finishItem(it) {
    flushTimer();
    const quiz = S.quiz[it.id];
    const tSec = S.itemTime[it.id] || 0;
    markDone(it.id, TODAY).then(n => {
      const ev = nextEvent();
      const ex = nextExam();
      summary = {
        title: itemLabel(it), unit: it.kind === 'unit', time: tSec, quiz: quiz ? quiz.best : null, cards: n,
        event: ev ? fmtDM(ev.d) + ' ' + ev.t : null,
        exam: ex ? (itemById(ex.id) || {}).title + ' · Ziel ' + fmtDM(ex.goal) : null
      };
      flow.id = null;
      save(); refresh();
      window.scrollTo(0, 0);
    });
  }

  function summaryHTML(s) {
    const nxt = currentItem();
    return '<div class="card summary"><div class="eyebrow">Abgeschlossen</div><h2>' + esc(s.title) + '</h2>' +
      '<div class="sum-grid"><div><span class="k">Zeit</span>' + esc(minTxt(s.time)) + '</div>' +
      (s.unit ? '<div><span class="k">Quiz</span>' + (s.quiz == null ? 'kommt noch' : esc(s.quiz) + ' %') + '</div>' : '') +
      '<div><span class="k">Neue Karten</span>' + esc(s.cards) + '</div></div>' +
      (s.event ? '<p><b>Nächster Termin:</b> ' + esc(s.event) + '</p>' : '') +
      (s.exam ? '<p class="small muted">Nächste Prüfung: ' + esc(s.exam) + '</p>' : '') +
      '<button class="btn primary big" id="btn-sum-next" type="button">' + (nxt ? 'Weiter: ' + esc(itemLabel(nxt)) : 'Weiter') + '</button></div>';
  }
  function bindSummary(box) {
    $('#btn-sum-next', box).onclick = () => { summary = null; flow.id = null; refresh(); window.scrollTo(0, 0); };
  }

  // ----- Quiz -----
  function initQuiz(it) {
    getJSON('data/quiz/' + it.id + '.json').then(j => {
      if (flow.id !== it.id) return;
      flow.quiz = { data: j, run: null };
      renderQuizIntro(it);
    }).catch(() => {
      const box = $('#quiz-box'); if (box) box.innerHTML = '<p class="muted">Quiz konnte nicht geladen werden. Prüf die Verbindung und lade neu.</p>';
    });
  }
  function quizBox() { return flow.el && $('#quiz-box', flow.el); }
  function renderQuizIntro(it) {
    const box = quizBox(); if (!box) return;
    const res = S.quiz[it.id];
    const n = flow.quiz.data.questions.length;
    let html = '<p>' + n + ' Fragen zur Unit. Ab ' + PASS + ' % bestanden. Nach jeder Frage siehst du sofort, ob es stimmt.</p>';
    if (res) html += '<div class="feedback ' + (res.passed ? 'ok' : 'no') + '"><b>' + (res.passed ? 'Bestanden' : 'Noch nicht bestanden') + '</b>Bestes Ergebnis: ' + res.best + ' % · zuletzt ' + res.last + ' % (' + res.tries + '× gemacht)</div>';
    html += '<button class="btn primary block" type="button" id="quiz-start">' + (res ? 'Nochmal' : 'Quiz starten') + '</button>';
    box.innerHTML = html;
    $('#quiz-start', box).onclick = () => startQuiz(it);
  }
  function startQuiz(it) {
    const qs = shuffle(flow.quiz.data.questions).map(q => prepQuestion(q));
    flow.quiz.run = { qs, i: 0, correct: 0, checked: false };
    renderQuestion(it);
  }
  function prepQuestion(q) {
    const p = { src: q, type: q.type };
    if (q.type === 'single' || q.type === 'multi') {
      p.order = shuffle(q.options.map((_, i) => i));
    } else if (q.type === 'match') {
      p.rights = shuffle(q.pairs.map((_, i) => i));
    } else if (q.type === 'gap') {
      p.gapOrders = q.gaps.map(g => shuffle(g.options.map((_, i) => i)));
    }
    return p;
  }
  function renderQuestion(it) {
    const box = quizBox(); if (!box) return;
    const run = flow.quiz.run;
    const p = run.qs[run.i];
    const q = p.src;
    const name = 'q' + run.i;
    let body = '';
    if (q.type === 'single' || q.type === 'multi') {
      const typ = q.type === 'single' ? 'radio' : 'checkbox';
      body = p.order.map(oi => '<label class="opt" data-oi="' + oi + '"><input type="' + typ + '" name="' + name + '" value="' + oi + '"><span>' + esc(q.options[oi]) + '</span></label>').join('');
      if (q.type === 'multi') body = '<p class="small muted">Mehrere Antworten können richtig sein.</p>' + body;
    } else if (q.type === 'tf') {
      body = '<label class="opt" data-oi="1"><input type="radio" name="' + name + '" value="1"><span>Wahr</span></label>' +
        '<label class="opt" data-oi="0"><input type="radio" name="' + name + '" value="0"><span>Falsch</span></label>';
    } else if (q.type === 'match') {
      body = q.pairs.map((pair, li) => '<div class="match-row"><div class="left">' + esc(pair[0]) + '</div><select data-li="' + li + '" aria-label="Zuordnung für ' + esc(pair[0]) + '"><option value="">– wählen –</option>' +
        p.rights.map(ri => '<option value="' + ri + '">' + esc(q.pairs[ri][1]) + '</option>').join('') + '</select></div>').join('');
    } else if (q.type === 'gap') {
      const parts = q.q.split('___');
      body = '<div class="gap-text">' + parts.map((t, gi) => esc(t) + (gi < q.gaps.length ? '<select data-gi="' + gi + '" aria-label="Lücke ' + (gi + 1) + '"><option value="">…</option>' +
        p.gapOrders[gi].map(oi => '<option value="' + oi + '">' + esc(q.gaps[gi].options[oi]) + '</option>').join('') + '</select>' : '')).join('') + '</div>';
    }
    const qText = q.type === 'gap' ? 'Fülle die Lücken.' : q.type === 'tf' ? 'Wahr oder falsch?' : '';
    box.innerHTML = '<div class="quiz-meta"><span>Frage ' + (run.i + 1) + ' von ' + run.qs.length + '</span><span>' + run.correct + ' richtig</span></div>' +
      '<div class="progress"><i style="width:' + Math.round(run.i / run.qs.length * 100) + '%"></i></div>' +
      (qText ? '<p class="small muted" style="margin:0">' + qText + '</p>' : '') +
      (q.type === 'gap' ? '' : '<p class="quiz-q">' + esc(q.q) + '</p>') + body +
      '<div id="quiz-fb"></div><button class="btn primary block" type="button" id="quiz-check">Prüfen</button>';
    run.checked = false;
    $('#quiz-check', box).onclick = () => { if (!run.checked) checkQuestion(it); else nextQuestion(it); };
  }
  function checkQuestion(it) {
    const box = quizBox(); const run = flow.quiz.run; const p = run.qs[run.i]; const q = p.src;
    let ok = false, answered = true, solution = '';
    if (q.type === 'single' || q.type === 'tf') {
      const sel = $('input:checked', box);
      if (!sel) answered = false;
      else {
        const v = Number(sel.value);
        const right = q.type === 'single' ? q.answer : (q.answer ? 1 : 0);
        ok = v === right;
        $$('.opt', box).forEach(o => { const oi = Number(o.dataset.oi); if (oi === right) o.classList.add('right'); else if (oi === v) o.classList.add('wrong'); });
        if (!ok) solution = 'Richtig ist: ' + (q.type === 'single' ? q.options[q.answer] : (q.answer ? 'Wahr' : 'Falsch'));
      }
    } else if (q.type === 'multi') {
      const sel = $$('input:checked', box).map(x => Number(x.value));
      if (!sel.length) answered = false;
      else {
        const ans = q.answer.slice().sort();
        ok = sel.length === ans.length && sel.slice().sort().every((v, i) => v === ans[i]);
        $$('.opt', box).forEach(o => { const oi = Number(o.dataset.oi); const r = q.answer.indexOf(oi) >= 0; const c = sel.indexOf(oi) >= 0; if (r) o.classList.add('right'); else if (c) o.classList.add('wrong'); });
        if (!ok) solution = 'Richtig sind: ' + q.answer.map(a => q.options[a]).join(' · ');
      }
    } else if (q.type === 'match') {
      const sels = $$('select', box);
      if (sels.some(s => s.value === '')) answered = false;
      else {
        ok = true;
        sels.forEach(s => { const r = Number(s.value) === Number(s.dataset.li); s.classList.add(r ? 'right' : 'wrong'); if (!r) ok = false; });
        if (!ok) solution = 'Richtig: ' + q.pairs.map(pr => pr[0] + ' → ' + pr[1]).join(' · ');
      }
    } else if (q.type === 'gap') {
      const sels = $$('select', box);
      if (sels.some(s => s.value === '')) answered = false;
      else {
        ok = true;
        sels.forEach(s => { const g = q.gaps[Number(s.dataset.gi)]; const r = Number(s.value) === g.answer; s.classList.add(r ? 'right' : 'wrong'); if (!r) ok = false; });
        if (!ok) solution = 'Richtig: ' + q.gaps.map(g => g.options[g.answer]).join(' · ');
      }
    }
    if (!answered) { toast('Bitte erst antworten.'); return; }
    run.checked = true;
    if (ok) run.correct++;
    $$('input,select', box).forEach(x => { x.disabled = true; });
    $('#quiz-fb', box).innerHTML = '<div class="feedback ' + (ok ? 'ok' : 'no') + '"><b>' + (ok ? 'Richtig.' : 'Nicht ganz.') + '</b>' + esc(q.explain || '') +
      (solution ? '<div class="solution">' + esc(solution) + '</div>' : '') + '</div>';
    $('#quiz-check', box).textContent = run.i + 1 < run.qs.length ? 'Nächste Frage' : 'Ergebnis zeigen';
  }
  function nextQuestion(it) {
    const run = flow.quiz.run;
    run.i++;
    if (run.i < run.qs.length) { renderQuestion(it); quizBox().scrollIntoView({ block: 'start' }); return; }
    const pct = Math.round(run.correct / run.qs.length * 100);
    const passed = pct >= PASS;
    const old = S.quiz[it.id] || { best: 0, tries: 0, passed: false };
    S.quiz[it.id] = { last: pct, best: Math.max(old.best || 0, pct), passed: old.passed || passed, tries: (old.tries || 0) + 1, date: TODAY };
    save();
    const box = quizBox();
    box.innerHTML = '<div class="score">' + pct + ' %</div><p style="text-align:center">' + run.correct + ' von ' + run.qs.length + ' richtig.</p>' +
      '<div class="feedback ' + (passed ? 'ok' : 'no') + '"><b>' + (passed ? 'Bestanden.' : 'Noch nicht bestanden.') + '</b>' +
      (passed ? 'Stark. Ergebnis ist gespeichert, du kannst weiter.' : 'Ab ' + PASS + ' % geht’s weiter. Schau nochmal in deine Mitschrift, dann neuer Versuch mit gemischten Fragen.') + '</div>' +
      '<button class="btn ' + (passed ? '' : 'primary') + ' block" type="button" id="quiz-again">Nochmal</button>';
    $('#quiz-again', box).onclick = () => startQuiz(it);
    updateFlowFoot();
    box.scrollIntoView({ block: 'start' });
  }

  // ======================================================
  // PLAN
  // ======================================================
  let planWeek = null;
  function renderPlan() {
    if (!planWeek) planWeek = mondayOf(TODAY < START ? START : TODAY);
    const p = computePlan();
    const root = $('#page-plan');
    const sun = addDays(planWeek, 6);
    const wk = weekNumber(planWeek);
    let html = '<div class="card"><div class="weeknav"><button class="btn" type="button" id="wk-prev" aria-label="Vorige Woche">‹</button>' +
      '<div class="wk">KW ' + wk + ' · ' + fmtDM(planWeek) + '–' + fmtDMY(sun) + '</div><button class="btn" type="button" id="wk-next" aria-label="Nächste Woche">›</button></div>' +
      (planWeek !== mondayOf(TODAY) ? '<div class="btn-row"><button class="btn soft" id="wk-today" type="button">Zu dieser Woche</button></div>' : '') + '</div>';
    const ws = weekSec(planWeek);
    const goal = S.settings.goalH * 3600;
    html += '<div class="card"><div class="hero-row" style="justify-content:space-between"><b>Lernzeit diese Woche</b><span class="muted">' + hoursTxt(ws) + ' von ' + esc(S.settings.goalH) + ' Std</span></div>' +
      '<div class="progress" style="margin-bottom:0"><i style="width:' + Math.min(100, Math.round(ws / Math.max(1, goal) * 100)) + '%"></i></div></div>';
    for (let i = 0; i < 7; i++) html += dayHTML(addDays(planWeek, i), p);
    // Lernzeit pro Tag
    html += '<div class="section-title">Lernzeit pro Tag</div><div class="card bars">';
    let max = 1;
    for (let i = 0; i < 7; i++) max = Math.max(max, (S.time[addDays(planWeek, i)] || 0) + (addDays(planWeek, i) === TODAY ? runningSec() : 0));
    max = Math.max(max, 3 * 3600);
    for (let i = 0; i < 7; i++) {
      const d = addDays(planWeek, i);
      const sec = (S.time[d] || 0) + (d === TODAY ? runningSec() : 0);
      html += '<div class="bar"><span>' + esc(fmtShort(d)) + '</span><span class="track"><span class="fill" style="width:' + Math.round(sec / max * 100) + '%"></span></span><span class="val">' + hm(sec) + '</span></div>';
    }
    html += '</div>';
    // Prüfungen
    html += '<div class="section-title">Prüfungen</div><div class="card">';
    D.EXAMS.slice().sort((a, b) => a.goal < b.goal ? -1 : 1).forEach(e => {
      const m = D.MODS[e.mod] || {};
      const fin = p.finish[e.id];
      const done = !!S.done[e.id];
      const ok = fin && fin <= e.goal;
      const cls = !fin ? '' : ok ? 'green' : 'red';
      const status = done ? 'erledigt am ' + fmtDMY(S.done[e.id]) : fin ? 'voraussichtlich fertig: ' + fmtDMY(fin) : 'nicht im Plan';
      html += '<div class="exam"><span class="ampel ' + cls + '" role="img" aria-label="' + (ok ? 'im Plan' : 'zu spät') + '"></span><div><b>' + esc(m.name || e.mod) + '</b> <span class="badge ' + (ok ? 'ok' : fin ? 'bad' : '') + '">' + (ok ? 'vor Ziel' : fin ? 'zu spät' : '–') + '</span>' +
        '<div class="meta">' + esc(m.exam || '') + ' · Ziel ' + esc(fmtDMY(e.goal)) + '</div><div class="meta">' + esc(status) + '</div></div></div>';
    });
    html += '</div>';
    // Fortschritt
    html += '<div class="section-title">Fortschritt je Modul</div><div class="card bars">';
    Object.keys(D.MODS).forEach(mod => {
      const units = D.QUEUE.filter(x => x.mod === mod && x.kind === 'unit');
      const total = (D.UNITS[mod] || units).length || units.length;
      const n = units.filter(x => S.done[x.id]).length;
      html += '<div class="bar"><span>' + esc(modShort(mod)) + '</span><span class="track"><span class="fill" style="--c:' + esc(modColor(mod)) + ';width:' + Math.round(n / Math.max(1, total) * 100) + '%"></span></span><span class="val">' + n + ' / ' + total + '</span></div>';
    });
    html += '</div>';
    root.innerHTML = html;
    $('#wk-prev', root).onclick = () => { planWeek = addDays(planWeek, -7); renderPlan(); };
    $('#wk-next', root).onclick = () => { planWeek = addDays(planWeek, 7); renderPlan(); };
    const wt = $('#wk-today', root); if (wt) wt.onclick = () => { planWeek = mondayOf(TODAY); renderPlan(); };
    $$('select[data-day]', root).forEach(s => {
      s.onchange = () => {
        const d = s.dataset.day;
        if (s.value === defaultType(d)) delete S.dayType[d]; else S.dayType[d] = s.value;
        save(); toast('Tagestyp geändert. Plan neu verteilt.'); renderPlan();
      };
    });
    $$('input[data-done]', root).forEach(c => {
      c.onchange = () => {
        const id = c.dataset.done, d = c.dataset.date;
        if (c.checked) markDone(id, d < TODAY ? d : TODAY).then(() => renderPlan());
        else { delete S.done[id]; save(); renderPlan(); }
      };
    });
    $$('[data-unskip]', root).forEach(b => { b.onclick = () => { delete S.skip[b.dataset.unskip]; save(); renderPlan(); }; });
  }
  function weekNumber(s) {
    const d = parse(s); const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() + 3 - (t.getDay() + 6) % 7);
    const w1 = new Date(t.getFullYear(), 0, 4);
    return 1 + Math.round(((t - w1) / 864e5 - 3 + (w1.getDay() + 6) % 7) / 7);
  }
  function dayHTML(d, p) {
    const day = p.days[d] || { entries: [] };
    const isToday = d === TODAY;
    const type = dayType(d);
    let html = '<div class="card day' + (isToday ? ' is-today' : '') + (d < TODAY ? ' is-past' : '') + '"><div class="day-head"><div class="day-name">' + (isToday ? 'Heute · ' : '') + esc(fmtShort(d)) + '</div>';
    html += '<select data-day="' + d + '" aria-label="Tagestyp ' + esc(fmtShort(d)) + '"' + (d < START ? ' disabled' : '') + '>' +
      Object.keys(D.DAYTYPES).map(k => '<option value="' + k + '"' + (k === type ? ' selected' : '') + '>' + esc(D.DAYTYPES[k].l) + '</option>').join('') + '</select></div>';
    if (S.skip[d]) html += '<div class="hero-row" style="margin-top:6px"><span class="badge warn">fällt aus</span><button class="link" type="button" data-unskip="' + d + '">rückgängig</button></div>';
    if (day.entries.length) {
      html += '<ul class="items">';
      day.entries.forEach(e => {
        const it = itemById(e.id);
        const done = !!S.done[e.id];
        const late = d < TODAY && !done;
        html += '<li><label><input type="checkbox" data-done="' + esc(e.id) + '" data-date="' + d + '"' + (done ? ' checked' : '') + '>' +
          '<span class="mdot" style="--c:' + esc(modColor(it.mod)) + ';margin-top:0"></span><span class="' + (done ? 'is-done' : '') + '">' + esc(entryLabel(e)) +
          (e.puffer ? ' <span class="badge">Puffer</span>' : '') + (late ? ' <span class="late">offen</span>' : '') + '</span></label></li>';
      });
      html += '</ul>';
    } else if (d >= START && !S.skip[d]) {
      html += '<div class="empty">' + (blocksOf(d).learn + blocksOf(d).puffer > 0 && d > p.end ? 'Plan ist hier schon fertig.' : 'Kein Lernblock.') + '</div>';
    } else if (d < START) html += '<div class="empty">Vor Studienstart.</div>';
    if (day.pufferFree) html += '<div class="empty">Puffer-Block: Karten wiederholen oder aufholen.</div>';
    D.EVENTS.filter(ev => ev.d === d).forEach(ev => { html += '<div class="ev">' + esc(ev.t) + '</div>'; });
    html += '</div>';
    return html;
  }

  // ======================================================
  // KARTEN
  // ======================================================
  const cardState = { filter: 'ALL', session: null };
  function renderKarten() {
    const root = $('#page-karten');
    const all = Object.keys(S.cards);
    const f = cardState.filter;
    const inF = id => f === 'ALL' || S.cards[id].mod === f;
    const due = dueCards(f).length;
    const total = all.filter(inF).length;
    const sure = all.filter(id => inF(id) && S.cards[id].box >= 4).length;
    const mods = Object.keys(D.MODS).filter(m => all.some(id => S.cards[id].mod === m));
    let html = '<div class="counters"><div><b>' + due + '</b><span>fällig heute</span></div><div><b>' + total + '</b><span>gesamt</span></div><div><b>' + sure + '</b><span>sicher</span></div></div>';
    html += '<div class="chips" role="group" aria-label="Nach Modul filtern"><button class="chip" type="button" data-filter="ALL" aria-pressed="' + (f === 'ALL') + '">Alle</button>' +
      mods.map(m => '<button class="chip" type="button" data-filter="' + m + '" aria-pressed="' + (f === m) + '">' + esc(modShort(m)) + '</button>').join('') + '</div>';
    const s = cardState.session;
    if (s && s.queue.length) {
      const id = s.queue[0]; const c = S.cards[id];
      html += '<div class="quiz-meta"><span>' + s.done + ' geschafft · noch ' + s.queue.length + '</span><span>Box ' + (c.box + 1) + ' von 6</span></div>' +
        '<div class="progress"><i style="width:' + Math.round(s.done / Math.max(1, s.done + s.queue.length) * 100) + '%"></i></div>' +
        '<button class="card flash" type="button" id="flash" aria-label="Karte umdrehen"><span class="side">' + esc(modShort(c.mod)) + ' · ' + esc((itemById(c.unit) || {}).title || c.unit) + '</span>' +
        '<span class="front">' + esc(c.f) + '</span>' + (s.flipped ? '<span class="back">' + esc(c.b) + '</span>' : '<span class="small muted">Antippen zum Umdrehen</span>') + '</button>';
      if (s.flipped) html += '<div class="rate"><button class="btn r0" type="button" data-rate="0">Wusste ich nicht</button><button class="btn r1" type="button" data-rate="1">Unsicher</button><button class="btn r2" type="button" data-rate="2">Wusste ich</button></div>';
      html += '<div class="btn-row"><button class="link" type="button" id="sess-end">Wiederholen beenden</button></div>';
    } else if (s && !s.queue.length) {
      html += '<div class="card done-msg"><div class="big">Geschafft.</div><p class="muted">' + s.done + ' Karten wiederholt. Morgen geht’s weiter.</p><button class="btn" type="button" id="sess-close">Okay</button></div>';
    } else if (due) {
      html += '<div class="card done-msg"><div class="big">' + due + ' ' + (due === 1 ? 'Karte' : 'Karten') + ' fällig</div><p class="muted">Vorderseite lesen, Antwort denken, umdrehen, ehrlich bewerten.</p><button class="btn primary big" type="button" id="sess-start">Los geht’s</button></div>';
    } else {
      html += '<div class="card done-msg"><div class="big">Nichts fällig.</div><p class="muted">' + (total ? 'Alles wiederholt. Neue Karten kommen, wenn du Units abschließt.' : 'Noch keine Karten. Sie kommen automatisch, wenn du eine Unit abschließt.') + '</p></div>';
    }
    html += '<p class="small muted">Wiederholung nach Leitner: Wusste ich → nächste Box (Abstand 1, 3, 7, 14, 30 Tage). Wusste ich nicht → zurück auf Box 1, heute nochmal.</p>';
    root.innerHTML = html;
    $$('[data-filter]', root).forEach(b => { b.onclick = () => { cardState.filter = b.dataset.filter; cardState.session = null; renderKarten(); }; });
    const st = $('#sess-start', root); if (st) st.onclick = () => { cardState.session = { queue: shuffle(dueCards(cardState.filter)).sort((a, b) => S.cards[a].due < S.cards[b].due ? -1 : S.cards[a].due > S.cards[b].due ? 1 : 0), flipped: false, done: 0 }; renderKarten(); };
    const fl = $('#flash', root); if (fl) fl.onclick = () => { cardState.session.flipped = !cardState.session.flipped; renderKarten(); };
    $$('[data-rate]', root).forEach(b => { b.onclick = () => rateCard(Number(b.dataset.rate)); });
    const en = $('#sess-end', root); if (en) en.onclick = () => { cardState.session = null; renderKarten(); };
    const cl = $('#sess-close', root); if (cl) cl.onclick = () => { cardState.session = null; renderKarten(); };
  }
  function rateCard(r) {
    const s = cardState.session; if (!s || !s.queue.length) return;
    const id = s.queue.shift(); const c = S.cards[id];
    let nb;
    if (r === 0) { nb = 0; c.due = TODAY; s.queue.push(id); }
    else if (r === 1) { nb = c.box; c.due = addDays(TODAY, Math.max(1, INTERVALS[nb])); s.done++; }
    else { nb = Math.min(5, c.box + 1); c.due = addDays(TODAY, INTERVALS[nb]); s.done++; }
    c.box = nb; s.flipped = false;
    save(); renderKarten();
  }

  // ======================================================
  // UNI & CLAUDE
  // ======================================================
  function linkRow(label, url, sub) {
    return '<a class="linkrow" target="_blank" rel="noopener" href="' + esc(url) + '"><span>' + esc(label) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><span class="arrow" aria-hidden="true">↗</span></a>';
  }
  function renderUni() {
    const root = $('#page-uni');
    const cur = currentItem() || lastUnit();
    let html = '<div class="section-title">Hochschule</div><div class="card links">' +
      linkRow('CampusNet', CAMPUSNET, 'Noten, Prüfungsanmeldung, Bescheinigungen') +
      linkRow('E-Campus: Allgemeines', ECAMPUS(7413)) +
      linkRow('E-Campus: Studienstart', ECAMPUS(7080)) +
      linkRow('E-Campus: Prüfungen', ECAMPUS(8368)) +
      linkRow('Fact Sheets Prüfungen', FACTSHEETS, 'Online-Test, Hausarbeit, Einsendeaufgabe') +
      '<a class="linkrow" href="mailto:' + EXAM_MAIL + '"><span>Prüfungsservice<small>' + EXAM_MAIL + '</small></span><span class="arrow" aria-hidden="true">✉</span></a></div>';
    html += '<div class="section-title">Module</div>';
    Object.keys(D.MODS).forEach(mod => {
      const m = D.MODS[mod];
      html += '<div class="card mod-card"><h3><span class="mdot" style="--c:' + esc(m.c) + '"></span>' + esc(m.name) + '</h3><p class="small muted">' + esc(m.exam) + '</p><div class="links">' +
        linkRow('E-Campus-Kurs', ECAMPUS(D.COURSE_IDS[mod])) +
        (m.books || []).map(code => linkRow('Studienheft ' + code, HEFT(code), (D.books[code] || {}).title || '')).join('') + '</div></div>';
    });
    html += '<div class="section-title">Claude</div><div class="card"><a class="btn primary block" target="_blank" rel="noopener" href="' + esc(PROJECT_URL) + '">Claude-Projekt öffnen</a>' +
      '<p class="small muted">Nachricht kopieren, Projekt öffnen, einfügen:</p><div class="links">' +
      copyRow('Mitschrift-Check', cur ? mitschriftText(cur) : 'Mitschrift-Check: (Unit). Fotos kommen gleich.') +
      copyRow('Test-Sitzung Einführung', testText('BEPSYC')) +
      copyRow('Test-Sitzung Wiss. Arbeiten', testText('BWISAR')) +
      copyRow('Plan neu machen, ich hänge hinterher', replanText()) + '</div></div>';
    html += '<div class="section-title">Einstellungen</div><div class="card">' +
      '<div class="field"><label for="goal">Lernzeit-Ziel pro Woche (Std)</label><input type="number" id="goal" min="1" max="60" step="1" inputmode="numeric" value="' + esc(S.settings.goalH) + '"></div>' +
      '<div class="field"><label for="theme">Darstellung</label><select id="theme"><option value="auto">Automatisch</option><option value="light">Hell</option><option value="dark">Dunkel</option></select></div>' +
      '<p class="small muted">Dein Stand liegt nur in diesem Browser. Mit Export/Import überträgst du ihn zwischen PC und Handy.</p>' +
      '<div class="btn-row"><button class="btn" type="button" id="btn-export">Export</button><button class="btn" type="button" id="btn-import">Import</button></div>' +
      '<input type="file" id="file-import" accept="application/json,.json" hidden>' +
      '<div class="btn-row"><button class="btn danger" type="button" id="btn-reset">Alles zurücksetzen</button></div></div>';
    root.innerHTML = html;
    $$('[data-copy]', root).forEach(b => { b.onclick = () => copyAndToast(b.dataset.copy); });
    const g = $('#goal', root);
    g.onchange = () => { const v = Math.round(Number(g.value)); if (v >= 1 && v <= 60) { S.settings.goalH = v; save(); toast('Ziel: ' + v + ' Std pro Woche'); } else g.value = S.settings.goalH; };
    const th = $('#theme', root); th.value = S.settings.theme || 'auto';
    th.onchange = () => { S.settings.theme = th.value; save(); applyTheme(); };
    $('#btn-export', root).onclick = exportState;
    const fi = $('#file-import', root);
    $('#btn-import', root).onclick = () => fi.click();
    fi.onchange = () => { if (fi.files && fi.files[0]) importState(fi.files[0]); fi.value = ''; };
    $('#btn-reset', root).onclick = () => {
      if (!window.confirm('Wirklich alles zurücksetzen? Erledigt-Haken, Quiz, Lernzeit und Karten werden gelöscht. Tipp: vorher Export machen.')) return;
      S = defaults();
      try { localStorage.removeItem(KEY); } catch (e) { /* egal */ }
      resetUI(); save(); toast('Zurückgesetzt.'); renderUni(); updateTimerUI();
    };
  }
  function copyRow(label, text) {
    return '<button class="linkrow" type="button" style="border:0;width:100%;font:inherit;text-align:left;cursor:pointer" data-copy="' + esc(text) + '"><span>' + esc(label) + '<small>' + esc(text.length > 90 ? text.slice(0, 90) + '…' : text) + '</small></span><span class="arrow" aria-hidden="true">⧉</span></button>';
  }
  function lastUnit() {
    const done = D.QUEUE.filter(x => x.kind === 'unit' && S.done[x.id]);
    return done.length ? done[done.length - 1] : null;
  }
  function resetUI() { flow.id = null; flow.el = null; flow.item = null; summary = null; cardState.session = null; planWeek = null; }

  function exportState() {
    flushTimer(); save();
    const data = { app: 'lernraum', version: 1, exportedAt: new Date().toISOString(), state: S };
    try {
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'lernraum-stand-' + TODAY + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('Export erstellt.');
    } catch (e) { toast('Export ging nicht.'); }
  }
  function importState(file) {
    const r = new FileReader();
    r.onload = () => {
      let data;
      try { data = JSON.parse(String(r.result)); } catch (e) { toast('Datei ist kein gültiger Lernraum-Export.'); return; }
      if (!data || data.app !== 'lernraum' || !isObj(data.state)) { toast('Datei ist kein gültiger Lernraum-Export.'); return; }
      if (!window.confirm('Stand vom ' + (data.exportedAt ? new Date(data.exportedAt).toLocaleString('de-DE') : '?') + ' laden? Der aktuelle Stand hier wird ersetzt.')) return;
      S = merge(defaults(), data.state);
      resetUI(); save(); applyTheme(); toast('Import fertig.'); renderUni(); updateTimerUI();
    };
    r.onerror = () => toast('Datei konnte nicht gelesen werden.');
    r.readAsText(file);
  }
  function applyTheme() {
    const t = S.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }

  // ======================================================
  // START
  // ======================================================
  function init() {
    applyTheme();
    Promise.all([
      getJSON('data/studium.json'), getJSON('data/studienhefte-kapitel.json'),
      getJSON('data/ecampus-units.json'), getJSON('data/inhalte.json')
    ]).then(([st, hefte, ec, inh]) => {
      Object.assign(D, st);
      hefte.forEach(b => { D.books[b.code] = b; (b.sections || []).forEach(s => { D.sections[s.id] = { num: s.num, title: s.title, code: b.code }; }); });
      D.ecampus = (ec && ec.units) || {};
      D.inhalte = Object.assign({ media: {}, quiz: [], karten: [] }, inh);
      if (S.timer.running && Date.now() - S.timer.startedAt > MAX_TIMER_SEC * 1000) {
        flushTimer(); S.timer.running = false; save();
        toast('Der Timer lief über 4 Std und wurde gestoppt.');
      }
      if (!S.timer.running && S.timer.day !== TODAY && S.timer.session) { S.timer.session = 0; save(); }
      $('#loading').hidden = true;
      $$('.tabbar button').forEach(b => { b.onclick = () => show(b.dataset.page); });
      $('#timer-pill').onclick = () => show('heute');
      const h = (location.hash || '').replace('#', '');
      show(PAGES.indexOf(h) >= 0 ? h : 'heute');
      setInterval(tick, 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
    }).catch(err => {
      $('#loading').innerHTML = 'Daten konnten nicht geladen werden.<br><span class="small">Öffne die Seite über den Link (nicht als Datei) und lade neu.</span>';
      if (window.console) console.warn(err);
    });
  }
  function checkDay() {
    const t = todayStr();
    if (t !== TODAY) {
      if (S.timer.running) flushTimer(); else S.timer.session = 0;
      TODAY = t; planCache = null; flow.id = null; summary = null; planWeek = null; refresh();
    }
  }
  let ticks = 0;
  function tick() {
    updateTimerUI();
    if (++ticks % 60 === 0) { checkDay(); if (S.timer.running) { flushTimer(); save(); } }
  }
  window.addEventListener('pagehide', () => { if (S.timer.running) { flushTimer(); save(); } });
  // Nur zum Nachsehen/Testen in der Konsole
  window.Lernraum = { plan: () => computePlan(), state: () => S, today: () => TODAY };

  init();
})();
