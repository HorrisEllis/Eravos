'use strict';
/**
 * emergence_links — lives in the COUPLE's shared database. Doesn't
 * duplicate emergence's own storage (person-store/idea-store/event-ledger
 * already do that under emergence/data/) — just records which emergence
 * "space" and person-ids correspond to this couple/these users, so the
 * app knows where to call for GET /space/health, POST /tick, etc.
 * (matches the ONE existing real wire-up in eravos-kernel.js's
 * computeRelationalHealth(), described in MAP.md).
 */

module.exports = {
  emergence_links: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'coupleId', type: 'uuid' },
    { name: 'emergenceSpaceId', type: 'text' },     // id emergence's own space-distance/person-store uses
    { name: 'userIdToPersonId', type: 'json' },      // { [userId]: emergencePersonId }
    { name: 'linkedAt', type: 'datetime' },
  ],
};
