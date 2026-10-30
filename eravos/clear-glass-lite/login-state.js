'use strict';
/**
 * login-state.js — tracks which ACCOUNTS (plural, per provider) the user
 * has connected, for the UI's benefit. Still not where sessions live —
 * see main.js's partitionFor() — this is just the account list + labels.
 *
 * §MULTI-ACCOUNT 2026-07-19 — "once it has cookies stored, split the
 * button with an add another." One provider can now have multiple
 * connected accounts (work ChatGPT, personal ChatGPT, etc), each with
 * its own isolated session partition. Shape changed from
 * `{ [providerId]: {connectedAt, lastUsedAt} }` (one slot per provider)
 * to `{ [providerId]: { accounts: [{id, label, connectedAt, lastUsedAt}] } }`
 * (a list per provider) — the whole reason this file's shape exists now.
 */
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getUserDataPath } = require('./paths');

const STATE_FILE = path.join(getUserDataPath(), 'login-state.json');

function _load() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    // §MIGRATION — a v1.0 state file (one account per provider, no
    // accounts[] array) still needs to load into something the rest of
    // this file can work with, not throw or silently discard the user's
    // existing connections. Folds a v1.0 entry into a single-item
    // accounts[] the first time this loads, same non-destructive pattern
    // this codebase uses elsewhere for schema migrations.
    for (const providerId of Object.keys(raw)) {
      const entry = raw[providerId];
      if (entry && !Array.isArray(entry.accounts)) {
        raw[providerId] = {
          accounts: [{
            id: 'default',
            label: 'Account 1',
            connectedAt: entry.connectedAt || Date.now(),
            lastUsedAt: entry.lastUsedAt || Date.now(),
          }],
        };
      }
    }
    return raw;
  } catch (_) { return {}; }
}

function _save(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.error('[login-state] save failed:', e.message);
  }
}

function newAccountId() {
  return crypto.randomUUID();
}

function getAccounts(providerId) {
  const state = _load();
  return state[providerId]?.accounts || [];
}

function addAccount(providerId, accountId, label) {
  const state = _load();
  if (!state[providerId]) state[providerId] = { accounts: [] };
  const existing = state[providerId].accounts.find(a => a.id === accountId);
  if (existing) {
    existing.lastUsedAt = Date.now();
  } else {
    state[providerId].accounts.push({
      id: accountId,
      label: label || `Account ${state[providerId].accounts.length + 1}`,
      connectedAt: Date.now(),
      lastUsedAt: Date.now(),
    });
  }
  _save(state);
  return state[providerId].accounts;
}

function touchAccount(providerId, accountId) {
  const state = _load();
  const account = state[providerId]?.accounts.find(a => a.id === accountId);
  if (account) { account.lastUsedAt = Date.now(); _save(state); }
}

function renameAccount(providerId, accountId, label) {
  const state = _load();
  const account = state[providerId]?.accounts.find(a => a.id === accountId);
  if (account) { account.label = label; _save(state); }
  return account || null;
}

function removeAccount(providerId, accountId) {
  const state = _load();
  if (!state[providerId]) return;
  state[providerId].accounts = state[providerId].accounts.filter(a => a.id !== accountId);
  if (state[providerId].accounts.length === 0) delete state[providerId];
  _save(state);
}

function getAll() {
  return _load();
}

module.exports = {
  newAccountId, getAccounts, addAccount, touchAccount,
  renameAccount, removeAccount, getAll,
};
