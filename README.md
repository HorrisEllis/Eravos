# Eravos

**Relationship intelligence dashboard for couples and long-distance relationships. Delta-driven onboarding. AI oracle. P2P sync via no-IP style DHCP. Jaa JSON/db file between partners. E2E encrypted vault.**

> Current status: specification complete, production code not yet built. Five `.docx` spec files exist covering auth architecture, developer reference, psychology audit, roadmap, and user manual. `index.html` is a PWA shell with theme — no application logic yet.

---

## Concept

Eravos adapts to the depth and intensity of a relationship — not a one-size-fits-all dashboard. Onboarding (attachment style, love language, empathy type, depth/intensity metric) feeds a delta that shapes the entire UI.

Two modes:
- **Duo** — both partners connected, real-time sync via P2P (no-IP / DHCP style)
- **Solo** — single user, relational tools hidden, emotional tools remain

The system is **interdependence-first**, not dependence. Nothing is one-way. Every action behind a wall requires mutual consent. Everything that needs to be requested stays behind a request wall — poking, sending love, and sharing needs are the only spontaneous actions.

---

## Architecture (Planned)

```
eravos/
├── index.html               PWA shell — theme only, no logic yet
├── src/
│   ├── auth/                Auth + invite code system
│   ├── sync/                Jaa JSON/db file sync between partners
│   ├── p2p/                 No-IP / DHCP style direct connect (no hosting fees)
│   ├── vault/               E2E encrypted vault (Jaa-backed)
│   ├── oracle/              AI oracle (Claude API via Bridge)
│   ├── modules/
│   │   ├── feelings/        Somatic check-in, feelings intelligence
│   │   ├── needs/           NVC needs finder
│   │   ├── pulse/           Relational pulse (4 sliders)
│   │   ├── rupture/         Rupture log + repair tracker
│   │   ├── planner/         Shared planner with timezone sync
│   │   ├── threads/         Message / thought threads
│   │   └── gratitude/       Gratitude prompts (non-forced)
│   └── onboarding/          Delta-driven onboarding flow
├── Eravos.md                Core concept spec
├── Eravors-Auth-Connection-Architecture.docx
├── Eravors-Developer-Reference.docx
├── Eravors-Psychology-Audit.docx
├── Eravors-Roadmap.docx
└── Eravors-User-Manual.docx
```

---

## Onboarding Delta

Every user goes through onboarding on account creation. Answers feed the delta that shapes their dashboard:

| Input | Purpose |
|-------|---------|
| Attachment style | Shapes communication features, urgency handling |
| Love language | Highlights relevant modules (words / acts / touch / time / gifts) |
| Empathy type | Emotional-somatic vs Cognitive-semantic vs Dual-processing |
| Depth metric | How detailed and introspective the UI becomes |
| Intensity metric | How active and urgent the system feels |
| Philosophy on love | Frames AI oracle responses |

---

## P2P Connection

No hosting fees. No server required after initial setup:

1. Both partners create accounts (one sends invite code)
2. App detects if partner is online (no-IP style DHCP client)
3. Direct P2P connection via Bridge WebRTC signaling
4. Jaa JSON/db file syncs between the two (Jaa Federation Phase)
5. E2E encrypted — only the dashboard can read the vault

Mobile: connect via browser on Android. Android receives push-style notifications even in sleep mode (if platform permits).

---

## Account Creation

```
Email, password, pet name, profile photo
Gender: open input (with "I don't identify with labels" option)
Sexuality: tailors dashboard (demi = feelings-first, etc.) optional "no labels" option
Invite code: one partner generates, shares with the other
Duo / Solo: selected at login time (no pressure, re-asked occasionally)
```

Once duo is online:
- Optional: team/duo/squad name, mythos, relationship builder (AI-guided)
- Session starts when both connected
- Data syncs in-session, saves to Jaa on disconnect

---

## AI Oracle

- Routes through NEXUS Bridge (Claude API)
- Translates partner messages to help understand communication style
- Soft popup: "Your needs are valid. Nothing you say stems from neediness."
- Gets better over time — delta-driven, recursive learning per user
- Guides through feelings, creative process, rupture repair

---

## What Exists

| Item | Status |
|------|--------|
| `index.html` | PWA shell, theme only — no logic |
| `Eravos.md` | Core concept document |
| 5 `.docx` spec files | Full specification across all domains |
| Production code | Nothing yet |
| README (this file) | Generated this session |
| MANIFEST.json | Generated this session |
| ROADMAP.md | Generated this session |
| CHANGELOG.md | Generated this session |

---

## Node Identity

```
Project UUID: eravos-relationship-intelligence-000-000000000001
Hook ID:      eravos.app:eravos-relationship-intelligence:er001
Bridge port:  :3747 (planned)
```
