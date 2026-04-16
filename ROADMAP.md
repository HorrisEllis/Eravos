# Eravos — Roadmap

Layer 5 · Application · v0.0.1 · Status: Specification

---

## Phase 0 — Specification ✓ COMPLETE

- [x] Core concept document (`Eravos.md`)
- [x] Auth + Connection Architecture spec (`.docx`)
- [x] Developer Reference spec (`.docx`)
- [x] Psychology Audit spec (`.docx`)
- [x] Roadmap spec (`.docx`)
- [x] User Manual spec (`.docx`)
- [x] PWA shell `index.html` — theme, manifest, icons
- [x] Project docs: README, MANIFEST, ROADMAP, CHANGELOG (this session)

---

## Phase 1 — Foundation PLANNED

- [ ] Project scaffold: `src/` directory structure
- [ ] Jaa wired as local database (JSON file mode)
- [ ] Auth: account creation, password hashing (bcrypt), email storage
- [ ] Auth: invite code generation + validation
- [ ] Auth: duo linking (two accounts → one session)
- [ ] Auth: solo / duo mode selection at login
- [ ] Session: Jaa-backed session storage
- [ ] PWA: service worker, offline-first shell
- [ ] Bridge: register as node at :3747

---

## Phase 2 — Onboarding Delta PLANNED

- [ ] Onboarding flow: attachment style questionnaire
- [ ] Onboarding flow: love language selection
- [ ] Onboarding flow: empathy type assessment (emotional-somatic / cognitive-semantic / dual)
- [ ] Onboarding flow: depth metric slider
- [ ] Onboarding flow: intensity metric slider
- [ ] Onboarding flow: philosophy on love (open text)
- [ ] Delta computed from onboarding → stored in Jaa
- [ ] Dashboard adapts layout to delta values
- [ ] Re-onboarding: delta updates over time with usage

---

## Phase 3 — Core Modules PLANNED

- [ ] Feelings module: somatic check-in, body map
- [ ] Needs module: NVC needs finder
- [ ] Relational pulse: 4-slider real-time state
- [ ] Rupture log: track + annotate relationship ruptures
- [ ] Rupture repair tracker
- [ ] Gratitude prompts (non-forced, optional cadence)

---

## Phase 4 — P2P Sync PLANNED

- [ ] No-IP style DHCP: both partners discover each other on local or remote network
- [ ] WebRTC signaling via NEXUS Bridge
- [ ] Jaa JSON/db file sync between partners (in-session)
- [ ] Offline queue: actions taken solo synced when duo reconnects
- [ ] Online indicator: show when partner is online (consent-gated)
- [ ] Push notification via Bridge: partner online event
- [ ] Android: notification delivery in sleep/DND mode (where platform permits)

---

## Phase 5 — AI Oracle PLANNED

- [ ] Oracle routes through NEXUS Bridge (Claude API)
- [ ] Context: full onboarding delta + session history per user
- [ ] Communication translation: helps partner understand each other's style
- [ ] Soft popup: consent-gated suggestions ("Your needs are valid...")
- [ ] Oracle improves recursively — delta updated with each session
- [ ] Rupture repair guidance via oracle
- [ ] Creative process guidance

---

## Phase 6 — Vault + E2E Encryption PLANNED

- [ ] E2E key exchange on duo link (public key per account, RSA-4096)
- [ ] Vault encrypted with shared derived key
- [ ] Only dashboard can decrypt (no cloud access)
- [ ] KeePass-compatible export option
- [ ] Vault integrity verification (Jaa hash-chained ledger)

---

## Phase 7 — Expansion PLANNED

- [ ] Optional social import: Instagram, Discord DM pattern scraping (Playwright, consent-gated, re-asked)
- [ ] Associative lattice: track ruptures, patterns, gaps across history
- [ ] Solo-to-duo matching: compatibility via app (based on onboarding delta)
- [ ] Flask server mode: run locally, connect via mobile browser
- [ ] Playwright: DM history scraping (consent-gated, re-asked on solo sessions)

---

## Known Gaps (RCA)

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| ER-001 | Zero production code | Critical | Phase 1 |
| ER-002 | No README, MANIFEST, ROADMAP, CHANGELOG in project root | Low | Fixed |
| ER-003 | P2P depends on Bridge WebRTC (Bridge WebRTC not fully implemented) | High | Bridge Phase 6 first |
| ER-004 | Jaa federation not yet built | High | Jaa Phase 5 first |
