'use strict';
/**
 * providers.js — the provider list this login hub knows about.
 *
 * Data reused verbatim from clear-glass/src/providers/registry.js (the
 * real, already-built NCP provider registry) — not invented. Stripped of
 * `userscriptFile`, since that's specific to Clear Glass's own NCP
 * automation layer (userscripts that read/write NEXUS's cortex over an
 * SSE channel) — not something this decoupled fork carries, by design.
 *
 * Add a fifth provider by adding one entry here — everything else
 * (the button grid, the per-provider window, session isolation) reads
 * from this list, nothing is hardcoded per-provider elsewhere.
 */
const PROVIDERS = {
  claude: {
    id:    'claude',
    name:  'Claude',
    url:   'https://claude.ai',
    hosts: ['claude.ai'],
    color: '#cc785c',
  },
  chatgpt: {
    id:    'chatgpt',
    name:  'ChatGPT',
    url:   'https://chatgpt.com',
    hosts: ['chatgpt.com', 'chat.openai.com'],
    color: '#19c37d',
  },
  gemini: {
    id:    'gemini',
    name:  'Gemini',
    url:   'https://gemini.google.com',
    hosts: ['gemini.google.com', 'aistudio.google.com'],
    color: '#4285f4',
  },
  perplexity: {
    id:    'perplexity',
    name:  'Perplexity',
    url:   'https://www.perplexity.ai',
    hosts: ['www.perplexity.ai', 'perplexity.ai'],
    color: '#20b2aa',
  },
};

function getProvider(id) {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

function listProviders() {
  return Object.values(PROVIDERS);
}

module.exports = { PROVIDERS, getProvider, listProviders };
