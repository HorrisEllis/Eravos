# SPEC-REGISTRY

§6.3 — every `.spec` in the project is tracked here. An untracked spec is
invisible, and an invisible spec drifts.

| spec | uuid | version | lifecycle | owner | verified by |
|---|---|---|---|---|---|
| `spec/alk-lattice.spec` | `eravos-lattice-core-0001-0000-000000000002` | 0.4.0 | Implemented | `eravos/tabs/lattice` | `test/lattice.test.mjs` — 23/23 |
| `spec/voice-dimension.spec` | `eravos-voice-module-0001-0000-000000000003` | 0.4.0 | Implemented | `eravos/tabs/voice` | `test/voice.test.mjs` — 23/23 |
| `spec/admin.spec` | `eravos-admin-engine-0001-0000-000000000001` | 0.5.0 | Implemented | `shared/eravos-admin.js` | `test/admin.test.mjs` — 28/28 |
| `spec/PHASEMAP-v4.2.md` | — | 0.29.4 | Specified | `spec/` | Phase 0 inserted ahead of I (accounts/backend, priority override); O/R/S/V marked DONE; Y (co-creation) and Z (oracle, cross-cutting retrofit) added at the end; I–N, T, U, W, X still open |
| `spec/PHASEMAP-v4.md` | — | 0.17.0 | Specified | `spec/` | superseded by v4.2 — kept for history, not the current plan |
| `spec/PHASEMAP-v3.md` | — | 0.6.0 | Specified | `spec/` | phases A–C implemented; D–H open |
| `contracts/choice.contract.json` | `eravos-choice-primitive-0001-0000-000000000001` | 0.6.0 | Implemented | `shared/eravos-choice.js` | `test/choice-chat.test.mjs` — 15/15 |
| `contracts/chat.contract.json` | `eravos-chat-engine-0001-0000-000000000001` | 0.6.0 | Implemented | `shared/eravos-chat.js` | `test/choice-chat.test.mjs` — 21/21 |
| `contracts/grammar.contract.json` | `eravos-grammar-store-0001-0000-000000000001` | 0.7.0 | Implemented | `shared/eravos-grammar.js` | `test/grammar.test.mjs` — 29/29 |
| `contracts/choice-field.contract.json` | `eravos-choice-field-0001-0000-000000000001` | 0.8.0 | Implemented | `shared/eravos-choice-field.js` | `test/choice-field.test.mjs` — 12/12 + `choice-lint` |
| `contracts/presence.contract.json` | `eravos-presence-shell-0001-0000-000000000001` | 0.10.0 | Implemented | `shared/eravos-presence.js` | `test/presence.test.mjs` — 18/18 |
| `contracts/select-grammar.contract.json` | `eravos-select-grammar-0001-0000-000000000001` | 0.11.0 | Implemented | `shared/eravos-select-grammar.js` | `test/select-grammar.test.mjs` — 17/17 |
| `contracts/pairing.contract.json` | `eravos-pairing-engine-0001-0000-000000000001` | 0.12.0 | Implemented | `shared/eravos-pairing.js` | `test/pairing.test.mjs` — 25/25 |
| `contracts/server-modules/module-flow.contract.json` | `eravos-module-flow-bus-0001-0000-000000000001` | 1.0.0 | Implemented | `server-modules/module-flow.js` | manually verified (real WARP bus dispatch, real observer notification, real JSONL persistence, real §14.3 signature-collision throw, real ddns:updated/ddns:update_failed integration against a live local mock provider) — no automated `test/module-flow.test.mjs` yet, honestly gapped rather than claimed |
| `contracts/qr.contract.json` | `eravos-qr-encoder-0001-0000-000000000001` | 0.12.0 | Implemented | `shared/eravos-qr.js` | `test/qr.test.mjs` — 23/23 (maths only; optics OPEN) |
| `contracts/hardtalk.contract.json` | `eravos-hardtalk-engine-0001-0000-000000000001` | 0.14.0 | Implemented | `shared/eravos-hardtalk.js` | `test/features-new.test.mjs` |
| `contracts/goals.contract.json` | `eravos-goals-engine-0001-0000-000000000001` | 0.14.0 | Implemented | `shared/eravos-goals.js` | `test/features-new.test.mjs` |
| `contracts/desires.contract.json` | `eravos-desires-engine-0001-0000-000000000001` | 0.14.0 | Implemented | `shared/eravos-desires.js` | `test/features-new.test.mjs` |

## Component UUIDs (§5.1 — every component has a UUID and a hook)

| uuid | hook | file |
|---|---|---|
| `eravos-alk-boot-0001-0000-000000000000` | `eravos.alk:boot:00000` | `shared/alk/alk-boot.js` |
| `alk-lattice-bus-0001-0000-000000000001` | `eravos.alk:bus-adapter:00001` | `shared/alk/alk-bus.js` |
| `alk-lattice-tab-0001-0000-000000000002` | `eravos.alk:text-affect-bridge:00002` | `shared/alk/text-affect-bridge.js` |
| `eravos-lattice-dimensions-0001-0000-000000000001` | `eravos.lattice:dimensions:00001` | `shared/alk/dimensions.js` |
| `eravos-lattice-core-0001-0000-000000000002` | `eravos.lattice:core:00002` | `shared/alk/multi-lattice.js` |
| — | `eravos.lattice:tab:00003` | `tabs/lattice/lattice.js` |
| `eravos-voice-prosody-0001-0000-000000000001` | `eravos.voice:prosody:00001` | `tabs/voice/prosody.js` |
| `eravos-voice-observer-0001-0000-000000000002` | `eravos.voice:observer:00002` | `tabs/voice/voice-observer.js` |
| `eravos-voice-module-0001-0000-000000000003` | `eravos.voice:module:00003` | `tabs/voice/voice.module.js` |
| — | `eravos.voice:tab:00004` | `tabs/voice/voice.js` |
| `eravos-admin-engine-0001-0000-000000000001` | `eravos.admin:engine:00001` | `shared/eravos-admin.js` |
| — | `eravos.admin:tab:00002` | `tabs/admin/admin.js` |
| `eravos-choice-primitive-0001-0000-000000000001` | `eravos.choice:primitive:00001` | `shared/eravos-choice.js` |
| `eravos-chat-engine-0001-0000-000000000001` | `eravos.chat:engine:00001` | `shared/eravos-chat.js` |
| — | `eravos.chat:tab:00002` | `tabs/chat/chat.js` |
| `eravos-grammar-store-0001-0000-000000000001` | `eravos.grammar:store:00001` | `shared/eravos-grammar.js` |
| — | `eravos.grammar:tab:00002` | `tabs/grammar/grammar.js` |
| `eravos-choice-field-0001-0000-000000000001` | `eravos.choice:field:00001` | `shared/eravos-choice-field.js` |
| `eravos-presence-shell-0001-0000-000000000001` | `eravos.presence:shell:00001` | `shared/eravos-presence.js` |
| `eravos-select-grammar-0001-0000-000000000001` | `eravos.grammar:select:00001` | `shared/eravos-select-grammar.js` |
| `eravos-pairing-engine-0001-0000-000000000001` | `eravos.pairing:engine:00001` | `shared/eravos-pairing.js` |
| `eravos-qr-encoder-0001-0000-000000000001` | `eravos.qr:encoder:00001` | `shared/eravos-qr.js` |
| `eravos-feature-registry-0001-0000-000000000001` | `eravos.features:registry:00001` | `shared/eravos-features.js` |
| `eravos-unified-server-0001-0000-000000000001` | `eravos.serve:unified:00001` | `eravos-serve.js` (repo root) |
| `eravos-safety-patterns-0001-0000-000000000001` | `eravos.safety:patterns:00001` | `shared/eravos-safety.js` |
| `eravos-regulation-gate-0001-0000-000000000001` | `eravos.regulation:gate:00001` | `shared/eravos-regulation.js` |
| `eravos-careprofile-0001-0000-000000000001` | `eravos.care:profile:00001` | `shared/eravos-careprofile.js` |
| `eravos-callaudio-0001-0000-000000000001` | `eravos.call:audio:00001` | `shared/eravos-callaudio.js` |
| `eravos-expressions-0001-0000-000000000001` | `eravos.expressions:set:00001` | `shared/eravos-expressions.js` |
| `eravos-relational-pipeline-0001-0000-000000000001` | `eravos.pipeline:kernel:00001` | `shared/eravos-pipeline.js` |
| `eravos-bridge-userscript-0001-0000-000000000001` | `eravos.bridge:userscript:00001` | `userscript/eravos-bridge.user.js` |
| `eravos-hardtalk-engine-0001-0000-000000000001` | `eravos.hardtalk:engine:00001` | `shared/eravos-hardtalk.js` |
| `eravos-goals-engine-0001-0000-000000000001` | `eravos.goals:engine:00001` | `shared/eravos-goals.js` |
| `eravos-desires-engine-0001-0000-000000000001` | `eravos.desires:engine:00001` | `shared/eravos-desires.js` |

## Vendored, unmodified (§17.5 — provenance is a hash, not a claim)

| file | lines | sha256 (first 12) | source |
|---|---|---|---|
| `shared/alk/latent-model.js` | 570 | `86dc863a7fbc` | Associative_Lattice `ALK/modules/signal/latent-model.js` |
| `shared/alk/htl.js` | 2043 | `472f1efcf104` | Associative_Lattice `CrystalBall/modules/ALK/modules/htl/htl.js` |

3 of htl.js's 12 modules are imported (NS-01, EMO-02, NEED-04). The other 9
require video and are present but unused — §16.5, not deleted from a vendored
file, because a modified vendor file loses its hash as provenance.

## Ported, with source line references

| file | from |
|---|---|
| `shared/alk/alk-bus.js` `FrictionAnalyzer` | NEXUS-CODEC v1.9.0 `codec.js:291-358` + lexicon `:136-190` |
| `shared/alk/signal-vector.js` | Resonance `src/extraction/heuristics.ts` |
| `shared/alk/dimensions.js` `lexical` | `codec.js` `AssociationEngine:369-455` |
| `tabs/voice/prosody.js` | Rheon Voice v7 `analysis-engine.js:222` (pitchEngine), `:185` (oscillationEngine) |
| `tabs/voice/voice.js` `snapshot()` | Rheon Voice v7 `audio-engine.js:157-211` |

## Legal (§6.1 — written from what the code does)

| file | covers |
|---|---|
| `legal/TERMS.md` | no provider, not clinical, not a safety device, not evidence; both-sides consent; self-hosting responsibility |
| `legal/PRIVACY.md` | what crosses the wire and what never does; encryption stated accurately (static-key ECDH, **no** forward secrecy); the public PeerJS/TURN bootstrap named as an open gap |

## Retired (§17.3 — rejections are recorded)

| what | why | where it went |
|---|---|---|
| `buildLatticeData()` flat renderer | one axis, no edges; tab copy promised clusters it never computed (§6.1) | `renderLatticeFlat_RETIRED_v0_3_17()` — kept addressable, not deleted silently |
| `raven-theme` / `golden-theme` / `romeo-theme` | §16.5 delete before add; every colour was already a kernel token so removal changed zero tab stylesheets | `RETIRED_THEMES` + `AdminEngine.purgeThemes()` migration path |
| duplicate `setRavenTheme()` definition | two live definitions of one name — the silent-precedence shape SISO Design Law 1 forbids | removed, not shadowed; one definition remains beside `setJamesTheme` |
| hardcoded `'raven'` partner account | identity was a constant, force-seeded on every load, silently reverting renames (§1.2) | partner slot is now data, seeded once; `shared/eravos-admin.js` is sole write authority (§10.1) |
