/* ─────────────────────────────────────────────────────────────────────────
   eravos-stickers.js — a real, small, custom set. Bundled with the app,
   not user-uploaded: BOTH sides already have the same definitions, which
   is exactly what makes these fit chat's existing reference-based
   attachment system correctly (see ATTACHMENT_KINDS in eravos-chat.js) --
   unlike real photo/video messages, which need their own bytes-carrying
   transport (see sendMediaMessage() in eravos-kernel.js and its own
   header on why that's a genuinely different thing).
   ───────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  var STICKERS = [
    { id: 'flame-heart',       label: 'flame heart',        file: 'flame-heart.svg' },
    { id: 'holding-hands',     label: 'holding hands',       file: 'holding-hands.svg' },
    { id: 'moon-stars',        label: 'thinking of you',     file: 'moon-stars.svg' },
    { id: 'intertwined-vines', label: 'growing together',    file: 'intertwined-vines.svg' },
    { id: 'warm-cup',          label: 'let\'s talk',         file: 'warm-cup.svg' },
    { id: 'sparkle-burst',     label: 'celebration',         file: 'sparkle-burst.svg' },
  ];

  function byId(id) {
    for (var i = 0; i < STICKERS.length; i++) if (STICKERS[i].id === id) return STICKERS[i];
    return null;
  }

  function url(id) {
    var s = byId(id);
    return s ? 'shared/stickers/' + s.file : null;
  }

  global.EravosStickers = { list: STICKERS, byId: byId, url: url };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { STICKERS: STICKERS, byId: byId, url: url };
  }
})(typeof window !== 'undefined' ? window : globalThis);
