'use strict';
/**
 * Schema for a single user's private database.
 * Lives under: <dataRoot>/users/<userId>/
 */

module.exports = {
  // One row: the user's own profile record. Password hash + wrapped master
  // key live OUTSIDE this encrypted table, in auth.json (see authFile.js) —
  // they can't live inside a table encrypted BY the master key they unlock.
  profile: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'email', type: 'text' },              // real email, encrypted at rest (index only stores its hash)
    { name: 'username', type: 'text' },
    { name: 'displayName', type: 'text' },
    { name: 'coupleId', type: 'uuid', nullable: true },
    { name: 'createdAt', type: 'datetime' },
  ],

  // Onboarding Q&A, one row per question answered.
  onboarding_answers: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'questionKey', type: 'text' },
    { name: 'answer', type: 'json' },
    { name: 'answeredAt', type: 'datetime' },
  ],

  // Per-module state — one row per (module, key) so each tab/module can store its own shape of data freely.
  module_state: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'module', type: 'text' },   // e.g. 'feelings-checkin', 'gratitude-loop', 'attachment-style'
    { name: 'key', type: 'text' },
    { name: 'value', type: 'json' },
    { name: 'updatedAt', type: 'datetime' },
  ],

  // Wrapped copies of shared keys this user has access to (couple key, etc.) — envelope-encrypted per user.
  granted_keys: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'scope', type: 'text' },        // 'couple'
    { name: 'scopeId', type: 'uuid' },      // coupleId
    { name: 'wrappedKey', type: 'json' },   // couple's data key, wrapped under THIS user's master key
    { name: 'grantedAt', type: 'datetime' },
  ],
};
