/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS EXPRESSIONS  ·  eravos-expressions.js  ·  v0.19.0
   UUID: eravos-expressions-0001-0000-000000000001
   HOOK: eravos.expressions:set:00001
   PARENT: eravos-choice-primitive-0001-0000-000000000001   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   Ways to say something without finding the words for it.

   ── WHY THIS IS NOT AN EMOJI PICKER ─────────────────────────────────────

   A phone keyboard already has every emoji. What it does not have is a set
   ORGANISED BY WHAT YOU ARE TRYING TO SAY, and a link back to the feeling
   you logged. Scrolling a grid of 3,000 pictures looking for the right one
   is more work than typing the sentence — which is why people give up and
   send the fire.
   
   So: grouped by intent, searchable by what it means rather than its
   Unicode name, and every entry carries the feelings it maps to. Sending one
   can set your feeling, because the two are the same act.

   ── EVERY ENTRY HAS WORDS (§ the Other primitive, and accessibility) ────

   Each carries a `says` — plain language for what it is being used to mean
   here. That is the alt text, it is what search matches on, and it is what
   makes the set usable by someone who reads emoji differently than you do.
   An emoji without words is a guess at both ends.

   ── AND "SOMETHING ELSE" IS ALWAYS THERE ────────────────────────────────

   Routed through the choice primitive, so a person can add their own — the
   private one that means something only between two people. That is where
   the real vocabulary lives, and no fixed set can contain it.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var EXPR_VERSION = '0.19.0';
  var EXPR_UUID = 'eravos-expressions-0001-0000-000000000001';

  /* e: emoji · s: what it says here · f: feelings it maps to */
  var GROUPS = [
    { id: 'hands', label: 'Hands', hint: 'The specific way you are holding them.', items: [
      // §0.1 — I had "holding your hand" and "fingers laced with yours" as
      // two entries. They are ONE act: holding hands IS interlaced. The real
      // distinctions are how COMMITTED the hold is — laced, cupped, a hand
      // rested on top — not laced versus held.
      { e: '🤝', s: 'holding your hand, fingers laced', f: ['Safe','Love'] },
      { e: '🫱🏽‍🫲🏾', s: 'not letting go', f: ['Love','Safe'] },
      { e: '🫂', s: 'holding you', f: ['Tender','Safe','Grief'] },
      { e: '🤲', s: 'both hands, take them', f: ['Open','Tender'] },
      { e: '👐', s: 'open, come in', f: ['Warm','Open'] },
      { e: '🫰', s: 'just your fingertips', f: ['Tender','Shy'] },
      { e: '🫶', s: 'your hand cupped in both of mine', f: ['Tender','Safe'] },
      { e: '🤟', s: 'hand rested on top of yours', f: ['Warm','Calm'] },
      { e: '🤞', s: 'holding on for us', f: ['Hope','Love'] },
      { e: '🫳', s: 'hand on the back of your neck', f: ['Tender','Safe'] },
      { e: '🫴', s: 'palm up, waiting for yours', f: ['Open','Longing'] },
      { e: '✊', s: 'squeezing once — I am here', f: ['Safe','Steady'] },
      { e: '🤙', s: 'reach for me', f: ['Longing'] },
      { e: '👋', s: 'hand on your arm', f: ['Warm'] },
      { e: '☝️', s: 'thumb across your knuckles', f: ['Tender','Calm'] },
      { e: '🖐', s: 'palm flat on your chest', f: ['Tender','Safe'] },
      { e: '🪢', s: 'hands knotted together', f: ['Love','Safe'] },
      { e: '💍', s: 'the hand with the ring on it', f: ['Love','Steady'] },
    ]},
    { id: 'closeness', label: 'Closeness', hint: 'Where you are in relation to them.', items: [
      { e: '🧎', s: 'head in your lap', f: ['Tender','Safe'] },
      { e: '🛌', s: 'curled into you', f: ['Tender','Calm'] },
      { e: '🫶', s: 'pulled against my chest', f: ['Love','Safe'] },
      { e: '👣', s: 'legs tangled', f: ['Tender','Content'] },
      { e: '🪞', s: 'forehead to forehead', f: ['Tender','Love'] },
      { e: '👃', s: 'nose in your hair', f: ['Tender','Love'] },
      { e: '🦻', s: 'listening to your heartbeat', f: ['Calm','Love'] },
      { e: '🧣', s: 'wrapped around you', f: ['Warm','Safe'] },
      { e: '🛋️', s: 'the same sofa, doing nothing', f: ['Content','Safe'] },
      { e: '🕯️', s: 'the quiet part of the evening', f: ['Calm','Romantic'] },
      { e: '🚿', s: 'still warm from you', f: ['Tender','Content'] },
      { e: '🧦', s: 'your feet on mine', f: ['Playful','Warm'] },
    ]},
    { id: 'holding', label: 'Being there', hint: 'Without needing to fix it.', items: [
      { e: '🤗', s: 'come here', f: ['Warm','Tender'] },
      { e: '🤲', s: 'I have got you', f: ['Safe','Tender'] },
      { e: '🫶', s: 'held between us', f: ['Love','Warm'] },
      { e: '👐', s: 'open arms', f: ['Warm','Open'] },
      { e: '🙌', s: 'I am here for it', f: ['Joy','Proud'] },
      { e: '🤝', s: 'we are in this', f: ['Safe','Steady'] },
      { e: '👫', s: 'side by side', f: ['Warm','Safe'] },
      { e: '🧸', s: 'soft with you', f: ['Tender','Safe'] },
      { e: '🛌', s: 'rest with me', f: ['Tired','Tender'] },
      { e: '🫱🏽‍🫲🏾', s: 'reaching for you', f: ['Longing','Warm'] },
      { e: '🪢', s: 'tied to you', f: ['Love','Safe'] },
    ]},
    { id: 'affection', label: 'Affection', hint: 'Plainly, without a reason attached.', items: [
      { e: '❤️', s: 'love you', f: ['Love'] },
      { e: '🧡', s: 'warm on you', f: ['Warm','Love'] },
      { e: '💛', s: 'fond of you', f: ['Warm','Joy'] },
      { e: '💚', s: 'steady love', f: ['Love','Safe'] },
      { e: '💙', s: 'calm love', f: ['Love','Calm'] },
      { e: '💜', s: 'deep love', f: ['Love','Tender'] },
      { e: '🤍', s: 'clean, no conditions', f: ['Love','Peace'] },
      { e: '🩶', s: 'love in a grey week', f: ['Love','Flat'] },
      { e: '💗', s: 'growing', f: ['Love','Hope'] },
      { e: '💓', s: 'you make it beat', f: ['Love','Alive'] },
      { e: '💞', s: 'circling each other', f: ['Love','Longing'] },
      { e: '💕', s: 'the two of us', f: ['Love','Warm'] },
      { e: '💘', s: 'still hit', f: ['Love','Alive'] },
      { e: '💖', s: 'bright on you', f: ['Love','Joy'] },
      { e: '💝', s: 'for you', f: ['Love','Grateful'] },
      { e: '❣️', s: 'and then some', f: ['Love'] },
      { e: '💟', s: 'kept', f: ['Love','Safe'] },
      { e: '♥️', s: 'simply', f: ['Love'] },
      { e: '🫀', s: 'the whole thing', f: ['Love','Raw'] },
      { e: '💌', s: 'wrote it down for you', f: ['Love','Tender'] },
    ]},
    { id: 'kissing', label: 'Kissing', hint: '', items: [
      { e: '😘', s: 'kiss', f: ['Love','Playful'] },
      { e: '😗', s: 'small kiss', f: ['Tender'] },
      { e: '😙', s: 'happy kiss', f: ['Joy','Love'] },
      { e: '😚', s: 'eyes closed', f: ['Tender','Love'] },
      { e: '💋', s: 'left one on you', f: ['Desire','Playful'] },
      { e: '💏', s: 'kissing you properly', f: ['Desire','Love'] },
      { e: '👩‍❤️‍💋‍👨', s: 'the long one', f: ['Desire','Love'] },
      { e: '🥰', s: 'undone by you', f: ['Love','Joy'] },
      { e: '😻', s: 'look at you', f: ['Love','Desire'] },
    ]},
    { id: 'touching', label: 'Touch', hint: 'What you would do with your hands if you were there.', items: [
      { e: '🫧', s: 'tracing circles on your back', f: ['Tender','Calm'] },
      { e: '🪶', s: 'barely touching', f: ['Tender','Desire'] },
      { e: '💆', s: 'hands in your hair', f: ['Tender','Calm'] },
      { e: '🤌', s: 'chin lifted with two fingers', f: ['Desire','Tender'] },
      { e: '🫂', s: 'from behind, arms around', f: ['Safe','Love'] },
      { e: '👂', s: 'lips at your ear', f: ['Desire','Tender'] },
      { e: '🖤', s: 'thumb on your wrist', f: ['Calm','Love'] },
      { e: '🤞', s: 'fingers laced', f: ['Hope','Warm'] },
      { e: '👋', s: 'hand on you', f: ['Warm'] },
      { e: '🫳', s: 'hand on your back', f: ['Safe','Tender'] },
      { e: '🫴', s: 'palm up, take it', f: ['Open','Tender'] },
      { e: '👆', s: 'chin up', f: ['Tender','Hope'] },
      { e: '🫰', s: 'small love', f: ['Love','Playful'] },
      { e: '✋', s: 'stop, gently', f: ['Overwhelm','Boundary'] },
      { e: '🤚', s: 'I need a minute', f: ['Overwhelm','Boundary'] },
      { e: '🖐', s: 'space, please', f: ['Overwhelm','Boundary'] },
      { e: '🦶', s: 'walking to you', f: ['Longing','Hope'] },
    ]},
    { id: 'desire', label: 'Wanting', hint: 'Only shows to someone you have paired with.', partnerOnly: true, items: [
      { e: '🔥', s: 'want you', f: ['Desire','Alive'] },
      { e: '🥵', s: 'undone', f: ['Desire'] },
      { e: '😏', s: 'thinking about it', f: ['Desire','Playful'] },
      { e: '👀', s: 'looking at you', f: ['Desire','Playful'] },
      { e: '🫦', s: 'holding it in', f: ['Desire','Longing'] },
      { e: '🌡️', s: 'rising', f: ['Desire'] },
      { e: '🍯', s: 'slow and sweet', f: ['Desire','Tender'] },
      { e: '🌶️', s: 'sharper than that', f: ['Desire','Playful'] },
      { e: '🛏️', s: 'come to bed', f: ['Desire','Tender'] },
      { e: '🕯️', s: 'set something up', f: ['Desire','Romantic'] },
    ]},
    { id: 'longing', label: 'Missing you', hint: 'The distance ones.', items: [
      { e: '🥹', s: 'miss you badly', f: ['Longing','Grief'] },
      { e: '🌙', s: 'thinking of you tonight', f: ['Longing','Tender'] },
      { e: '⭐', s: 'same sky', f: ['Longing','Hope'] },
      { e: '🌊', s: 'it comes in waves', f: ['Longing','Grief'] },
      { e: '🕰️', s: 'counting', f: ['Longing','Impatient'] },
      { e: '✈️', s: 'soon', f: ['Hope','Longing'] },
      { e: '🗺️', s: 'too far', f: ['Longing','Frustrated'] },
      { e: '📞', s: 'call me', f: ['Longing','Need'] },
      { e: '🪟', s: 'looking out, thinking of you', f: ['Longing','Wistful'] },
      { e: '🧣', s: 'wearing your one', f: ['Longing','Warm'] },
    ]},
    { id: 'hard', label: 'When it is hard', hint: 'Saying it without having to explain it.', items: [
      { e: '😔', s: 'low', f: ['Sad','Flat'] },
      { e: '😞', s: 'let down', f: ['Sad','Disappointed'] },
      { e: '😢', s: 'crying', f: ['Grief','Sad'] },
      { e: '😭', s: 'properly crying', f: ['Grief'] },
      { e: '🫤', s: 'not okay, cannot explain', f: ['Unsettled'] },
      { e: '😮‍💨', s: 'need to breathe', f: ['Overwhelm','Tired'] },
      { e: '🥴', s: 'foggy', f: ['Overwhelm','Tired'] },
      { e: '😰', s: 'anxious', f: ['Anxious','Fear'] },
      { e: '😨', s: 'scared', f: ['Fear'] },
      { e: '🫥', s: 'gone quiet inside', f: ['Numb','Dissociated'] },
      { e: '🪫', s: 'nothing left today', f: ['Tired','Flat'] },
      { e: '🧊', s: 'shut down', f: ['Numb','Withdrawn'] },
      { e: '🌧️', s: 'grey', f: ['Sad','Flat'] },
      { e: '🕳️', s: 'far down', f: ['Grief','Despair'] },
      { e: '😶‍🌫️', s: 'not here right now', f: ['Dissociated','Numb'] },
    ]},
    { id: 'friction', label: 'Friction', hint: 'For naming it early, before it becomes a rupture.', items: [
      { e: '😐', s: 'something is off', f: ['Unsettled'] },
      { e: '😤', s: 'frustrated', f: ['Frustrated','Angry'] },
      { e: '😠', s: 'angry', f: ['Angry'] },
      { e: '🫨', s: 'rattled', f: ['Activated','Anxious'] },
      { e: '🥊', s: 'want to spar this out', f: ['Frustrated','Alive'] },
      { e: '🧱', s: 'hitting a wall', f: ['Frustrated','Stuck'] },
      { e: '🔁', s: 'we are circling', f: ['Frustrated','Tired'] },
      { e: '⏸️', s: 'pause this', f: ['Overwhelm','Boundary'] },
      { e: '🚩', s: 'this matters, flagging it', f: ['Unsettled','Serious'] },
      { e: '🩹', s: 'want to repair', f: ['Hope','Tender'] },
      { e: '🤍‍🩹', s: 'sorry, properly', f: ['Remorse','Tender'] },
    ]},
    { id: 'good', label: 'Good', hint: '', items: [
      { e: '😊', s: 'content', f: ['Content','Warm'] },
      { e: '😁', s: 'glad', f: ['Joy'] },
      { e: '🥲', s: 'happy and it aches a bit', f: ['Joy','Tender'] },
      { e: '😌', s: 'settled', f: ['Calm','Peace'] },
      { e: '🥳', s: 'celebrating you', f: ['Joy','Proud'] },
      { e: '🤩', s: 'lit up', f: ['Joy','Alive'] },
      { e: '🌱', s: 'growing', f: ['Hope','Proud'] },
      { e: '☀️', s: 'clear day', f: ['Joy','Calm'] },
      { e: '🌈', s: 'after the rain', f: ['Hope','Relief'] },
      { e: '🫧', s: 'light', f: ['Playful','Joy'] },
      { e: '🎈', s: 'buoyant', f: ['Joy','Playful'] },
      { e: '🙏', s: 'grateful for you', f: ['Grateful','Tender'] },
      { e: '🥂', s: 'to us', f: ['Joy','Love'] },
    ]},
    { id: 'playful', label: 'Playful', hint: '', items: [
      { e: '😄', s: 'laughing', f: ['Joy','Playful'] },
      { e: '😜', s: 'winding you up', f: ['Playful'] },
      { e: '🤪', s: 'silly', f: ['Playful','Alive'] },
      { e: '🙃', s: 'ridiculous', f: ['Playful','Wry'] },
      { e: '😈', s: 'trouble', f: ['Playful','Desire'] },
      { e: '🫡', s: 'yes, boss', f: ['Playful'] },
      { e: '🤭', s: 'should not have said that', f: ['Playful','Shy'] },
      { e: '🥸', s: 'pretending I am fine', f: ['Playful','Guarded'] },
      { e: '🎲', s: 'roll for it', f: ['Playful'] },
      { e: '🕺', s: 'dancing about it', f: ['Joy','Playful'] },
    ]},
    { id: 'need', label: 'What I need', hint: 'Instead of hoping they guess.', items: [
      { e: '🫂', s: 'I need to be held', f: ['Need','Tender'] },
      { e: '👂', s: 'I need to be heard', f: ['Need'] },
      { e: '🤐', s: 'I need you not to fix it', f: ['Need','Overwhelm'] },
      { e: '🚪', s: 'I need space', f: ['Need','Overwhelm'] },
      { e: '🔦', s: 'I need honesty', f: ['Need','Serious'] },
      { e: '⏳', s: 'I need time', f: ['Need','Tired'] },
      { e: '🧭', s: 'I need reassurance', f: ['Need','Anxious'] },
      { e: '🍵', s: 'I need looking after', f: ['Need','Tired'] },
      { e: '🤍', s: 'I need you close', f: ['Need','Longing'] },
      { e: '📵', s: 'I need quiet', f: ['Need','Overwhelm'] },
      { e: '🛟', s: 'I need help', f: ['Need','Overwhelm'] },
    ]},
    { id: 'everyday', label: 'Everyday', hint: 'The ordinary texture of being in someone\u2019s life.', items: [
      { e: '☕', s: 'made you one in my head', f: ['Warm','Tender'] },
      { e: '🍳', s: 'cooking', f: ['Content'] },
      { e: '🚿', s: 'just got in', f: ['Content'] },
      { e: '🛏️', s: 'going to sleep', f: ['Tired'] },
      { e: '🌅', s: 'morning', f: ['Hope'] },
      { e: '🌃', s: 'up late', f: ['Tired','Wistful'] },
      { e: '🚶', s: 'walking', f: ['Calm'] },
      { e: '🎧', s: 'listening to something you would like', f: ['Warm','Longing'] },
      { e: '📚', s: 'reading', f: ['Calm','Content'] },
      { e: '💼', s: 'at work, thinking of you', f: ['Longing','Tired'] },
      { e: '🏠', s: 'home', f: ['Safe','Content'] },
      { e: '🧺', s: 'doing the boring bit', f: ['Content','Tired'] },
      { e: '🐕', s: 'with the dog', f: ['Content','Joy'] },
      { e: '🌦️', s: 'weather here', f: ['Content'] },
    ]},
  ];

  function all() {
    var out = [];
    GROUPS.forEach(function (g) {
      g.items.forEach(function (it) {
        out.push({ emoji: it.e, says: it.s, feelings: it.f || [],
                   group: g.id, groupLabel: g.label, partnerOnly: !!g.partnerOnly });
      });
    });
    return out;
  }
  var ALL = all();

  /* ── YOURS (v0.27.0) ─────────────────────────────────────────────────
     A fixed set of 179 cannot hold the one that means something only
     between two people — and that one is usually the most-used. Customs are
     stored, searchable and sendable exactly like built-ins, and they come
     FIRST because they are the ones you actually reach for.

     Private by default. Sharing what a symbol means to you is a separate,
     explicit act — same rule as the choice primitive. */
  var CUSTOM_KEY = 'eravors_custom_expressions';

  function store() {
    if (global.DB && typeof global.DB.get === 'function') return global.DB;
    return null;
  }
  function customs() {
    var db = store();
    if (!db) return [];
    return (db.get(CUSTOM_KEY, []) || []).filter(function (c) { return !c.archived; })
      .map(function (c) {
        return { emoji: c.emoji, says: c.says, feelings: c.feelings || [],
                 group: 'yours', groupLabel: 'Yours', partnerOnly: false,
                 custom: true, shared: !!c.shared, ts: c.ts };
      });
  }

  var Expressions = {
    VERSION: EXPR_VERSION,
    UUID: EXPR_UUID,
    GROUPS: GROUPS,
    CUSTOM_KEY: CUSTOM_KEY,

    /** Add your own. Any emoji, any meaning, any feelings it maps to. */
    addCustom: function (emoji, says, opts) {
      opts = opts || {};
      var db = store();
      if (!db) throw new Error('[expressions] no storage — DB is not loaded');
      var e = String(emoji == null ? '' : emoji).trim();
      var t = String(says == null ? '' : says).trim();
      if (!e) throw new Error('[expressions] addCustom(): an emoji is required');
      if (!t) throw new Error('[expressions] addCustom(): what does it mean when you send it? ' +
                              'An emoji without words is a guess at both ends.');
      if (t.length > 80) throw new Error('[expressions] addCustom(): 80 characters max');
      var list = db.get(CUSTOM_KEY, []) || [];
      var key = e + '|' + t.toLowerCase();
      var existing = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].emoji + '|' + String(list[i].says).toLowerCase() === key) existing = list[i];
      }
      if (existing) { existing.archived = false; existing.ts = Date.now(); }
      else {
        list.unshift({ emoji: e, says: t,
                       feelings: Array.isArray(opts.feelings) ? opts.feelings : [],
                       shared: !!opts.shared, archived: false, ts: Date.now() });
        if (list.length > 300) list = list.slice(0, 300);
      }
      db.set(CUSTOM_KEY, list);
      return { ok: true, emoji: e, says: t, reused: !!existing,
               note: opts.shared ? null : 'Yours alone. Telling them what it means is a separate act.' };
    },

    /** §0.3 — archived, never deleted. It can come back. */
    removeCustom: function (emoji, says) {
      var db = store();
      if (!db) return { ok: false };
      var list = db.get(CUSTOM_KEY, []) || [];
      var key = String(emoji) + '|' + String(says).toLowerCase();
      var hit = false;
      list.forEach(function (c) {
        if (c.emoji + '|' + String(c.says).toLowerCase() === key) { c.archived = true; hit = true; }
      });
      db.set(CUSTOM_KEY, list);
      return { ok: hit, note: 'Archived, not deleted — adding it again brings it straight back.' };
    },

    customs: customs,

    all: function () { return customs().concat(ALL); },
    count: function () { return ALL.length; },

    /** Search by MEANING, not by Unicode name. Prefix matches first. */
    search: function (q) {
      var s = String(q == null ? '' : q).toLowerCase().trim();
      var pool = customs().concat(ALL);
      if (!s) return pool;
      var starts = [], contains = [];
      pool.forEach(function (x) {
        var hay = (x.says + ' ' + x.feelings.join(' ') + ' ' + x.groupLabel).toLowerCase();
        if (x.says.toLowerCase().indexOf(s) === 0) starts.push(x);
        else if (hay.indexOf(s) !== -1) contains.push(x);
      });
      return starts.concat(contains);
    },

    /** Everything that maps to a given feeling — the link to the tracker. */
    forFeeling: function (name) {
      var n = String(name || '').toLowerCase();
      return customs().concat(ALL).filter(function (x) {
        return x.feelings.some(function (f) { return f.toLowerCase() === n; });
      });
    },

    /** The feelings one expression maps to — sending it can set your feeling. */
    feelingsFor: function (emoji) {
      var hit = customs().concat(ALL).filter(function (x) { return x.emoji === emoji; })[0];
      return hit ? hit.feelings.slice() : [];
    },

    /** Solo mode hides the wanting group. Nothing is sent to nobody. */
    visible: function (opts) {
      opts = opts || {};
      // Customs first — they are the ones you actually reach for.
      return customs().concat(ALL).filter(function (x) { return opts.paired ? true : !x.partnerOnly; });
    },

    /** §12.6 — and the checks that keep the set honest. */
    health: function () {
      var missingSays = ALL.filter(function (x) { return !x.says; });
      var missingFeelings = ALL.filter(function (x) { return !x.feelings.length; });
      // The same picture used for a DIFFERENT meaning is not a duplicate --
      // 🫂 is "holding you" in one group and "I need to be held" in another,
      // and those are opposite ends of the same gesture. The first version of
      // this check flagged all three and called the set healthy anyway, which
      // is a check that neither passes nor fails usefully (§12.2).
      // A real duplicate is the same emoji meaning the same thing twice.
      var seen = {}, dupes = [];
      ALL.forEach(function (x) {
        var key = x.emoji + '|' + x.says.toLowerCase();
        if (seen[key]) dupes.push(x.emoji + ' (' + x.says + ')');
        seen[key] = 1;
      });
      var reused = {};
      ALL.forEach(function (x) { reused[x.emoji] = (reused[x.emoji] || 0) + 1; });
      return {
        version: EXPR_VERSION,
        total: ALL.length,
        yours: customs().length,
        groups: GROUPS.length,
        // Every entry must have words: that is the alt text, the search index,
        // and what makes this usable by someone who reads emoji differently.
        missingSays: missingSays.length,
        missingFeelings: missingFeelings.length,
        duplicateMeanings: dupes,
        // information, not a fault: one gesture carrying two meanings
        reusedAcrossMeanings: Object.keys(reused).filter(function (e) { return reused[e] > 1; }),
        partnerOnly: ALL.filter(function (x) { return x.partnerOnly; }).length,
        status: (missingSays.length || missingFeelings.length || dupes.length) ? 'incomplete' : 'healthy',
      };
    },
  };

  global.EravosExpressions = Expressions;
  if (typeof module !== 'undefined' && module.exports) module.exports = Expressions;
})(typeof window !== 'undefined' ? window : globalThis);
