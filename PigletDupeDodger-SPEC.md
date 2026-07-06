# PigletDupeDodger — Technical Specification & Build Plan

Multi-operator, LAN-based, browser-run ARRL Field Day logging program with real-time dupe checking.
Handoff document for Claude Code. Target repo: **github.com/chengmania/PigletDupeDodger** (public).

---

## 0. First task: create the GitHub repo

Before writing any code:

```bash
gh auth status                     # verify chengmania is logged in
gh repo create chengmania/PigletDupeDodger --public \
  --description "Multi-op, offline-first, browser-based ARRL Field Day logger with real-time dupe dodging. Oink." \
  --clone
cd PigletDupeDodger
git branch -M main
```

Add topics after creation: `ham-radio`, `field-day`, `arrl`, `amateur-radio`, `logging`, `websocket`, `offline-first`.

Commit early and often with conventional commits (`feat:`, `fix:`, `docs:`). Push after each working milestone.

---

## 1. Product summary

- One machine at the Field Day site runs a **host binary** (from a flash drive). It serves the app and is the single source of truth.
- All operator stations connect from **any browser** (desktop, laptop, tablet, phone) via `http://<host-ip>:8073`. Zero install on clients.
- **Fully offline** — no internet at the site, ever. No external CDNs, no cloud signaling, no analytics. All assets embedded in the binary.
- Real-time shared log over WebSockets: live dupe checking, band/mode reservations, running score.
- Persists every event to an append-only journal on disk (the flash drive), so a crash or power loss never loses a logged QSO.
- Scale target: 5–10 concurrent operators comfortably; must not break at 25.

## 2. Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Server runtime | **Bun + TypeScript** | `bun build --compile` produces standalone cross-platform binaries (no runtime install for users) |
| Cross-compile targets | `bun-windows-x64`, `bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-x64` | Flash-drive distribution: `PigletDupeDodger-win.exe`, `-mac-arm`, `-mac-intel`, `-linux` |
| Transport | Native Bun WebSocket server + HTTP static serving | One port (default **8073**, configurable via `--port`) |
| Frontend | **Vanilla TypeScript + a small reactive store** (no framework) bundled to a single JS file; single `index.html` | Keeps the client tiny, fast on old laptops/tablets, zero dependency risk offline |
| Styling | Single hand-written CSS file, dark & light themes (dark default — FD runs overnight) | Readable in a dim tent at 0300 |
| Persistence | Append-only **JSONL journal** (`fdlog-data/journal.jsonl`) + periodic snapshot (`state.json`) | Human-recoverable with a text editor if all else fails |
| Client resilience | `localStorage` outbox queue; auto-reconnect with exponential backoff | WiFi drops must never stop logging |
| Tests | `bun test` for dupe engine, scoring engine, Cabrillo/dupe-sheet exporters | These are the rule-critical paths |

**Repo layout:**

```
/src/server/        host: http+ws server, journal, state machine
/src/client/        SPA: sign-in, band grid, logging, dashboard
/src/shared/        types, wire protocol, scoring + dupe engines, ARRL sections list
/public/            index.html, css, icons (embedded at build)
/scripts/build.ts   cross-compile all four binaries into /dist + zip a "flashdrive" folder
/tests/
README.md           user-facing quick start (see §12)
```

## 3. Domain rules the code MUST enforce (ARRL FD 2026)

Source: 2026FieldDayRules.pdf (in repo `/docs` — copy it in).

1. **Event window**: begins 1800 UTC Saturday (fourth full weekend of June), ends 2059 UTC Sunday (Rule 3). Host config stores the event start/end; QSOs outside the window are flagged (warn, still log — ops may be testing) and excluded from score/exports by default.
2. **Work once per band per mode** (Rule 6.3). Modes are exactly three buckets: **PH** (all voice equivalent, 6.6), **CW**, **DIG** (all non-CW digital equivalent, 6.7). Dupe key = `normalizedCall + band + mode + station` where `station ∈ {MAIN, GOTA}`.
3. **One transmitted signal per band-mode at a time** (Rule 6.5) → the reservation grid: at most one operator holds a given `band+mode` slot for the MAIN station. GOTA is limited to **one signal total at any time** (4.1.1) → GOTA is a single reservation slot, any band/mode.
4. **GOTA** (4.1.1): separate callsign, its own dupe space, its own log view, same exchange as parent. Its QSOs count for QSO credit **and** earn 5 bonus points each (7.3.13.1, not multiplied). GOTA coach bonus = flat 100 (7.3.13.2) as a host checklist item with a "coached contacts" counter (needs ≥10).
5. **Free VHF station** (4.1.2, Class A/F only): shows only bands ≥ 50 MHz; uses main callsign; normal dupe space (it's the MAIN station on VHF bands).
6. **Satellite** (7.3.7): logged with band = `SAT`; enforce max one completed QSO per single-channel FM satellite (satellite name field required for SAT QSOs); 100-pt bonus auto-claims on first SAT QSO. No cross-band except satellite (6.8) — moot since we log SAT as its own band.
7. **Bands**: 160m, 80m, 40m, 20m, 15m, 10m, 6m, 2m, 70cm (extensible list), SAT, GOTA-any. **No WARC bands** (12/17/30m are not FD bands — do not include them).
8. **Exchange**: class + section (e.g., `3A EPA`). Their side: class (regex `^\d{1,2}[ABCDEF]$` or `1AB`/`1BB` battery variants) + section from the official ARRL/RAC section list, or `DX` (Rule 5). Autocomplete both.
9. **Scoring** (Rule 7): PH = 1 pt, CW = 2, DIG = 2. Power multiplier ×5 (QRP battery), ×2 (≤100 W or QRP on generator/mains), ×1 (>100 W) — single club-wide setting chosen at host setup (7.2.5: highest power used governs everything). Score = QSO points × multiplier + bonuses + GOTA bonus points (unmultiplied).
10. **Bonus checklist** (7.3.1–7.3.18): host-editable checklist with point values, availability filtered by entry class (e.g., Safety Officer = Class A only; emergency power = 100/transmitter up to 20, excluding GOTA & free VHF). Store which are claimed; include in summary export.
11. **Operator can't work their own club's stations** (6.1): auto-dupe/blocked if the entered call equals the club call or GOTA call.

## 4. Data model (shared TypeScript types)

```ts
type Mode = 'PH' | 'CW' | 'DIG';
type StationKind = 'MAIN' | 'GOTA';

interface ClubConfig {
  clubName: string; clubCall: string; gotaCall?: string;
  entryClass: string;          // e.g. "3A"
  section: string;             // e.g. "EPA"
  powerMult: 1 | 2 | 5;
  eventStartUtc: string; eventEndUtc: string;
  location?: string;
}

interface Operator { call: string; name?: string; age18OrUnder?: boolean; connectedAt: string; }

interface Reservation { band: string; mode: Mode; station: StationKind; operatorCall: string; since: string; }

interface Qso {
  id: string;                  // uuid v7 (time-ordered)
  ts: string;                  // UTC ISO
  station: StationKind;
  band: string; mode: Mode;
  call: string;                // worked station, normalized upper
  exchClass: string; exchSection: string;
  operatorCall: string;
  satelliteName?: string;      // required when band === 'SAT'
  gotaCoached?: boolean;
  deleted?: boolean;           // soft delete via edit events
}
```

**Journal events** (JSONL, one per line): `config:set`, `op:join`, `op:leave`, `slot:reserve`, `slot:release`, `qso:add`, `qso:edit`, `qso:delete`, `bonus:set`. State = fold(journal). Snapshot every 60 s to `state.json` for fast restart; on boot, load snapshot then replay journal tail.

## 5. Wire protocol (WebSocket, JSON)

Client → server: `hello {operatorCall}`, `reserve {band,mode,station}`, `release`, `qso:add {…, clientId}`, `qso:edit`, `qso:delete`, `ping`.
Server → client: `welcome {fullState}` (config + reservations + complete QSO list + operators), `event {journalEvent}` (broadcast to all), `reject {reason, clientId?}`, `pong`.

- Full state on connect (a FD log is a few thousand QSOs — trivially small); thereafter incremental events. Clients hold the whole log in memory → **dupe checks are instant and local**, zero round trips while typing.
- Idempotency: `qso:add` carries a client-generated `clientId`; server dedupes on it so the offline outbox can safely retry.
- Conflict rule: server is authoritative; reservation conflicts return `reject` and the client refreshes the grid.

## 6. Client screens

1. **Connect/sign-in** — operator callsign (validated ham format), shows host, club, ops online.
2. **Band/mode grid** — live reservation matrix (bands × PH/CW/DIG), green open / amber taken (shows holder's call) / blue yours; GOTA and SAT rows special-cased. Claiming enforces Rule 6.5.
3. **Logging screen** (the heart):
   - Big callsign input, keyboard-first (Enter logs; Tab through class/section; Esc clears). Everything doable without a mouse.
   - Live dupe status while typing: **red** = dupe on current band/mode/station (block log button, allow override with confirm for rule-edge cases), **amber** = worked elsewhere (list where), **green** = new. Show partial-match hits as you type (worked-calls prefix search).
   - Section + class autocomplete; UTC clock; last-10 club-wide QSO ticker; your-session QSO count; edit/delete your recent entries.
4. **Dashboard** — live totals: QSO points, multiplier, bonuses, grand total; band/mode matrix; per-operator counts; GOTA bonus tally; bonus checklist (host-editable, others read-only).
5. **Host setup** (first run, host only): ClubConfig form + bonus checklist + export buttons + "event clock".
6. **Big-screen mode** — a read-only `/leaderboard` view: giant totals + live QSO ticker, for a monitor facing visitors (helps the Public Location bonus!).

## 7. Dupe engine (pure function, heavily tested)

```
normalize(call): trim, uppercase, strip portable suffixes for dupe MATCHING only
                 (log the full call as entered; match on base call — e.g. W1ABC/M ≡ W1ABC)
key(qso) = `${base(call)}|${band}|${mode}|${station}`
checkDupe(call, band, mode, station, log) →
  { status: 'DUPE' | 'NEW', workedElsewhere: Array<{band, mode, ts, by}> }
```

Edge cases to test: `/P`, `/M`, `/QRP`, `/AG` suffixes; `W1ABC` vs `w1abc `; same call MAIN vs GOTA (not a dupe across stations); club's own call (blocked, Rule 6.1); SAT band with per-satellite FM limit.

## 8. Scoring engine (pure function, heavily tested)

Implements §3.9–3.10 exactly. Input: QSO list + ClubConfig + bonus states → `{qsoPoints, multiplier, bonusPoints, gotaBonus, total, perBand, perMode, perOperator}`. Test vectors: worked examples from the rules PDF (e.g., 3 transmitters + GOTA on emergency power = 300 bonus).

## 9. Exports (client-side generation, download as files)

1. **Dupe sheet** (required, Rule 8.3.2.1): stations worked, sorted by band then mode, alpha order — printable HTML + CSV.
2. **Cabrillo 3.0** (`CATEGORY: FIELD-DAY`, correct `QSO:` lines with freq placeholder per band, mode mapping PH/CW/DG) — accepted in lieu of dupe sheet (8.7).
3. **Summary report** — everything needed to fill the ARRL web app: totals, per-band/mode counts, bonus claims, operator list (incl. GOTA operators, Rule 4.1.1.2), youth-bonus list.
4. **JSON backup** — full journal download from any client.

## 10. Resilience requirements

- Host: fsync journal on every `qso:add`; SIGINT-safe; restart resumes from snapshot+journal in <2 s.
- Client: on WS drop, banner "Offline — logging locally", queue events in localStorage, replay on reconnect (idempotent via clientId), re-diff state from fresh `welcome`.
- Clock sanity: clients display server UTC time (offset from `welcome`/`pong`), never trust laptop clocks for the QSO timestamp — **server stamps ts on receipt**, unless the QSO arrived from the offline queue (then client's queued UTC ts is used, flagged `queued: true`).

## 11. Build & distribution

`bun run build` →

```
dist/flashdrive/
  PigletDupeDodger-win.exe
  PigletDupeDodger-mac-arm
  PigletDupeDodger-mac-intel
  PigletDupeDodger-linux
  START-HERE.txt            # one-paragraph instructions per OS
  fdlog-data/               # created/used next to the binary (journal lives here)
```

On launch the binary prints and displays (also at `/` before setup): local IPs, port, and a **QR code** (pure-JS QR, embedded) pointing at `http://<ip>:8073` for phone/tablet ops.

## 12. Milestones (commit + push after each)

1. `feat: repo scaffold, shared types, journal read/write + snapshot, bun test setup`
2. `feat: dupe engine + scoring engine with full test suites` ← rules-critical, do before any UI
3. `feat: host server — http static, websocket, state fold, welcome/event broadcast`
4. `feat: client shell — connect, sign-in, band/mode reservation grid`
5. `feat: logging screen with live local dupe checking + section/class autocomplete`
6. `feat: dashboard, bonus checklist, host setup flow`
7. `feat: exports — dupe sheet, cabrillo, summary, json`
8. `feat: offline outbox, reconnect, server-stamped time`
9. `feat: cross-compile build script, QR code, flashdrive bundle, leaderboard view`
10. `docs: README with tent-ready quick start + screenshots`

## 13. Constants to embed

- Full **ARRL/RAC section list** (85 sections + DX) — fetch the current official list and embed as `/src/shared/sections.ts`.
- FD band list (§3.7) with Cabrillo frequency mappings.
- Bonus catalog (id, name, points, class availability, notes) transcribed from Rule 7.3.

## 14. Non-goals (v1)

- No rig control / CAT frequency capture (v2 candidate).
- No internet features of any kind (spotting networks, LoTW, etc.).
- No authentication beyond callsign sign-in — it's a trusted LAN in a field. The host can kick/rename operators.

---

*73, and may your dupes always be dodged.* 🐷
