/* ─────────────────────────────────────────────────────────────────────────
   grammar tab  ·  v0.7.0  ·  HOOK eravos.grammar:tab:00002
   Classic script. The store owns every write; this renders and confirms.
   §5.12 — deleting this removes the view, not the vocabulary.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function store() {
    if (!window.eravosGrammar) throw new Error('[grammar] store not booted — shared/eravos-grammar.js missing');
    return window.eravosGrammar;
  }
  function toast(m) { if (window.showToast) showToast(m); }
  function partnerName() {
    try {
      var users = window.DB ? DB.get('eravors_users', {}) : {};
      for (var k in users) if (users[k].role === 'partner') return users[k].name || 'them';
    } catch (e) {}
    return 'them';
  }
  function ago(ts) {
    if (!ts) return '';
    var d = Math.floor((Date.now() - ts) / 86400000);
    return d < 1 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? d + ' days ago'
         : d < 365 ? Math.round(d / 30) + ' months ago' : Math.round(d / 365) + ' years ago';
  }

  function meaningBlock(m, whoLabel) {
    if (!m) return '<div class="gr-meaning empty"><span class="who">' + esc(whoLabel) +
                   '</span>hasn\'t written what it means yet</div>';
    return '<div class="gr-meaning"><span class="who">' + esc(whoLabel) + '</span>' + esc(m.text) + '</div>';
  }

  function entryHtml(e, mode) {
    var g = store();
    var them = partnerName();
    var mm;
    try { mm = g.meaningsOf(e.id); } catch (x) { mm = { self: null, partner: null, diverge: false }; }

    var acts = '';
    if (mode === 'awaitingMe') {
      acts = '<div class="gr-acts">' +
        '<button class="gr-btn" onclick="grTakeUp(\'' + esc(e.id) + '\')">Take it up</button>' +
        '<button class="gr-btn ghost" onclick="grDecline(\'' + esc(e.id) + '\')">It means something else to me</button>' +
        '</div>';
    } else if (mode === 'awaitingThem') {
      acts = '<div class="gr-acts"><button class="gr-btn ghost" onclick="grRetire(\'' + esc(e.id) + '\')">Withdraw</button></div>';
    } else if (mode === 'shared') {
      acts = '<div class="gr-acts">' +
        '<button class="gr-btn ghost" onclick="grAddMeaning(\'' + esc(e.id) + '\')">What it means to me now</button>' +
        '<button class="gr-btn ghost" onclick="grRetire(\'' + esc(e.id) + '\')">Retire</button>' +
        '</div>';
    } else if (mode === 'retired') {
      acts = '<div class="gr-acts"><button class="gr-btn ghost" onclick="grRevive(\'' + esc(e.term) + '\')">Put it forward again</button></div>';
    }

    var when = mode === 'shared' ? 'shared ' + ago(e.takenUpAt)
             : mode === 'retired' ? 'retired ' + ago(e.retiredAt)
             : 'put forward ' + ago(e.proposedAt);
    if (e.declined && e.declined.why) when += ' · they said: ' + e.declined.why;

    return '<div class="gr-entry ' + (mode === 'shared' ? 'shared' : 'awaiting') + '">' +
      '<div class="gr-term">' + esc(e.term) + '</div>' +
      '<div class="gr-meanings">' +
        meaningBlock(mm.self, 'you') +
        meaningBlock(mm.partner, them) +
      '</div>' +
      (mm.diverge ? '<div class="gr-diverge">you two mean different things by this — that is allowed, and kept</div>' : '') +
      acts +
      '<div class="gr-when">' + esc(when) + '</div>' +
    '</div>';
  }

  function renderGrammarTab() {
    var host = document.getElementById('gr-shared-list');
    if (!host) return;
    var g;
    try { g = store(); } catch (err) {
      // §1.2 — a missing dependency is NAMED, never a blank tab that reads
      // like "you have no shared words yet".
      host.innerHTML = '<div class="gr-empty">' + esc(err.message) + '</div>';
      return;
    }

    var p = g.pending();
    var h = g.health();
    var sub = document.getElementById('gr-sub');
    if (sub) sub.textContent = h.byState.shared + ' shared · ' +
      (h.awaitingMe ? h.awaitingMe + ' waiting on you · ' : '') +
      (h.awaitingThem ? h.awaitingThem + ' waiting on them' : '').replace(/ · $/, '');

    var am = document.getElementById('gr-awaiting-me');
    var amList = document.getElementById('gr-awaiting-me-list');
    if (am && amList) {
      am.hidden = !p.awaitingMe.length;
      amList.innerHTML = p.awaitingMe.map(function (e) { return entryHtml(e, 'awaitingMe'); }).join('');
    }
    var at = document.getElementById('gr-awaiting-them');
    var atList = document.getElementById('gr-awaiting-them-list');
    if (at && atList) {
      at.hidden = !p.awaitingThem.length;
      atList.innerHTML = p.awaitingThem.map(function (e) { return entryHtml(e, 'awaitingThem'); }).join('');
    }

    var q = ((document.getElementById('gr-search') || {}).value || '').toLowerCase().trim();
    var shared = g.shared();
    if (q) shared = shared.filter(function (e) {
      if (e.term.toLowerCase().indexOf(q) !== -1) return true;
      var all = e.meanings.self.concat(e.meanings.partner);
      return all.some(function (m) { return m.text.toLowerCase().indexOf(q) !== -1; });
    });

    host.innerHTML = shared.length
      ? shared.map(function (e) { return entryHtml(e, 'shared'); }).join('')
      : '<div class="gr-empty">' + (q
          ? 'Nothing matches that yet.'
          : 'Nothing shared yet. Put a word forward with + — it becomes shared when ' +
            esc(partnerName()) + ' takes it up.') + '</div>';

    var ret = document.getElementById('gr-retired-list');
    if (ret) {
      var r = g.entries('retired');
      ret.innerHTML = r.length ? r.map(function (e) { return entryHtml(e, 'retired'); }).join('')
                               : '<div class="gr-empty">Nothing retired.</div>';
    }
    var hd = document.getElementById('gr-health');
    if (hd) hd.textContent = JSON.stringify(h, null, 1);
  }

  window.grTakeUp = function (id) {
    try {
      var m = window.prompt && window.prompt('What does it mean to you? (you can leave this blank)');
      show(store().takeUp(id, m || ''));
    } catch (e) { toast(e.message); }
  };
  window.grDecline = function (id) {
    try {
      var why = window.prompt && window.prompt('If you want to say why — optional:');
      show(store().decline(id, why || ''));
    } catch (e) { toast(e.message); }
  };
  window.grAddMeaning = function (id) {
    try {
      var m = window.prompt && window.prompt('What it means to you now:');
      if (!m || !m.trim()) return;
      show(store().addMeaning(id, m));
    } catch (e) { toast(e.message); }
  };
  window.grRetire = function (id) {
    try {
      var why = window.prompt && window.prompt('Anything to note? — optional. It is kept, not deleted:');
      show(store().retire(id, why || ''));
    } catch (e) { toast(e.message); }
  };
  window.grRevive = function (term) {
    try { show(store().propose(term, '')); } catch (e) { toast(e.message); }
  };
  function show(r) { if (r && r.note) toast(r.note); renderGrammarTab(); }

  function wire() {
    var openBtn = document.getElementById('gr-new');
    var form = document.getElementById('gr-propose');
    var term = document.getElementById('gr-term');
    var meaning = document.getElementById('gr-meaning');
    if (openBtn && form) openBtn.addEventListener('click', function () {
      form.hidden = !form.hidden;
      if (!form.hidden && term) term.focus();
    });
    var cancel = document.getElementById('gr-propose-cancel');
    if (cancel && form) cancel.addEventListener('click', function () { form.hidden = true; });
    var go = document.getElementById('gr-propose-go');
    if (go) go.addEventListener('click', function () {
      try {
        var r = store().propose(term ? term.value : '', meaning ? meaning.value : '');
        if (term) term.value = '';
        if (meaning) meaning.value = '';
        if (form) form.hidden = true;
        show(r);
      } catch (e) { toast(e.message); }
    });
    var search = document.getElementById('gr-search');
    if (search) search.addEventListener('input', renderGrammarTab);
    try { store().on(renderGrammarTab); } catch (e) {}
  }

  window.renderGrammarTab = renderGrammarTab;
  window.EravosTabInitRenderers = window.EravosTabInitRenderers || {};
  window.EravosTabInitRenderers.grammar = function () { renderGrammarTab(); wire(); };
})();
