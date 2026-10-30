'use strict';
/**
 * Schema for a couple's SHARED database (co-creation space).
 * Lives under: <dataRoot>/couples/<coupleId>/
 * Encrypted with a couple-specific key, envelope-wrapped into each
 * partner's own private db (see granted_keys in users/schema.js) so
 * only the two actual partners can ever unwrap it — not the server,
 * because there isn't one; this dir is what each device's local relay
 * copy would sync peer-to-peer.
 */

module.exports = {
  couple: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'memberUserIds', type: 'json' },  // [userIdA, userIdB]
    { name: 'connectedAt', type: 'datetime' },
    { name: 'sharedLatticeId', type: 'uuid', nullable: true }, // links to emergence "space"
  ],

  chat_messages: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'senderUserId', type: 'uuid' },
    { name: 'text', type: 'text' },
    { name: 'sentAt', type: 'datetime' },
    { name: 'emergenceProcessed', type: 'boolean' }, // flips true once fed to emergence/tick
  ],

  cocreation_notes: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'authorUserId', type: 'uuid' },
    { name: 'body', type: 'json' },
    { name: 'createdAt', type: 'datetime' },
  ],
};
