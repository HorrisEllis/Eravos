'use strict';
/**
 * InviteCode.js — the 8-digit partner invite: generate() ties a code to
 * the inviter's user id; redeem() validates it, creates the couple, and
 * provisions the shared couple database with envelope-encrypted access
 * for both partners.
 */

const crypto = require('crypto');
const path = require('path');
const { GlobalIndex } = require('../index/GlobalIndex.js');
const { Database } = require('../core/Database.js');
const cipher = require('../crypto/Cipher.js');
const coupleSchema = require('./schema.js');
const userSchema = require('../users/schema.js');

function generateCode() {
  // 8 digits, zero-padded, never starting with a run that reads like a test value
  return crypto.randomInt(0, 100000000).toString().padStart(8, '0');
}

class InviteCode {
  constructor(dataRoot) {
    this.dataRoot = dataRoot;
    this.index = new GlobalIndex(dataRoot);
  }

  /** Generate a fresh, unused 8-digit invite code for this user. */
  generate(inviterUserId, { ttlMs } = {}) {
    let code;
    do {
      code = generateCode();
    } while (this.index.codeExists(code));
    this.index.createInvite(code, inviterUserId, ttlMs);
    return code;
  }

  /**
   * Redeem a code as `inviteeUserId`. On success, creates the couple's
   * shared database, wraps its data key for BOTH partners, records the
   * couple link on both profiles, and returns the couple info.
   *
   * @param {Buffer} inviteeMasterKey - the redeeming user's own master key
   *   (needed to wrap the couple key for them — get this from UserStore.login/createUser)
   * @param {Database} inviteeDb - the redeeming user's open database
   * @param {(userId: string) => { db: Database, masterKey: Buffer }} openInviter -
   *   callback to open the inviter's db+key (e.g. because they're on the
   *   same device in this demo, or via whatever session mechanism the app uses)
   */
  redeem(code, { inviteeUserId, inviteeMasterKey, inviteeDb, openInviter }) {
    const invite = this.index.getInvite(code);
    if (!invite) throw new Error('Invalid invite code.');
    if (invite.used) throw new Error('This invite code has already been used.');
    if (new Date(invite.expiresAt) < new Date()) throw new Error('This invite code has expired.');
    if (invite.inviterUserId === inviteeUserId) throw new Error("You can't redeem your own invite code.");

    const existing = this.index.findCoupleByMembers(invite.inviterUserId, inviteeUserId);
    if (existing) throw new Error('You are already connected as partners.');

    const inviterUserId = invite.inviterUserId;
    const { db: inviterDb, masterKey: inviterMasterKey } = openInviter(inviterUserId);

    // Provision the shared couple database.
    const coupleId = crypto.randomUUID();
    const coupleDir = path.join(this.dataRoot, 'couples', coupleId);
    const coupleKey = cipher.randomKey();
    const coupleDb = new Database(coupleDir, coupleKey);
    coupleDb.defineSchema(coupleSchema);
    coupleDb.table('couple').insert(
      {
        memberUserIds: [inviterUserId, inviteeUserId],
        connectedAt: new Date().toISOString(),
        sharedLatticeId: null,
      },
      { id: coupleId }
    );

    // Envelope-encrypt the couple key for each partner: wrapped under
    // THEIR OWN master key, stored in THEIR OWN private database. Neither
    // partner's copy is readable by anyone but that partner (or, once
    // unwrapped locally, by both — that's the point, they're partners).
    const wrappedForInviter = cipher.wrapKey(inviterMasterKey, coupleKey);
    const wrappedForInvitee = cipher.wrapKey(inviteeMasterKey, coupleKey);

    inviterDb.table('granted_keys').insert({
      scope: 'couple',
      scopeId: coupleId,
      wrappedKey: wrappedForInviter,
      grantedAt: new Date().toISOString(),
    });
    inviteeDb.table('granted_keys').insert({
      scope: 'couple',
      scopeId: coupleId,
      wrappedKey: wrappedForInvitee,
      grantedAt: new Date().toISOString(),
    });

    inviterDb.table('profile').update(inviterUserId, { coupleId });
    inviteeDb.table('profile').update(inviteeUserId, { coupleId });

    this.index.registerCouple(coupleId, { members: [inviterUserId, inviteeUserId], dir: coupleDir });
    this.index.markInviteUsed(code);

    return { coupleId, coupleDb, coupleKey };
  }

  /**
   * Re-open a couple's shared database as a given (already-authenticated)
   * member — unwraps the couple key from that member's own granted_keys.
   */
  openCoupleAsMember(memberUserId, memberDb, memberMasterKey) {
    const grant = memberDb.table('granted_keys').findOne(
      (row) => row.scope === 'couple'
    );
    if (!grant) throw new Error('This user has no couple to open.');
    const couple = this.index.getCouple(grant.scopeId);
    if (!couple) throw new Error('Couple record not found.');

    const coupleKey = cipher.unwrapKey(memberMasterKey, grant.wrappedKey);
    const coupleDb = new Database(couple.dir, coupleKey);
    return { coupleId: grant.scopeId, coupleDb, coupleKey };
  }
}

module.exports = { InviteCode };
