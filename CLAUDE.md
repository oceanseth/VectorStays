# VectorStays

Airbnb property operations + voice-agent platform. Legacy PHP web app + MySQL on AWS, serving `vision.vectorstays.com`.

## Stack overview

| Layer | What |
|---|---|
| Web server | nginx + php-fpm (Docker Compose in `docker/`) |
| Language | PHP 7+, mysqli via custom wrapper (`tools/db.php`) |
| DB | MySQL — database name `vector`, schema in `tools/db.sql` |
| Frontend | `www/index.html` SPA shell — jQuery + vanilla JS + Bootstrap + DataTables + FullCalendar + Firebase RTDB (`vector-3b246`) |
| PMS integration | Guesty webhooks → `www/guesty_hook.php`, `www/reservationsHook.php` |
| Voice agent | bland.ai inbound DID `+18056788907` |
| Deploy | `www/deploy.php?pw=<pw>&deploy=1` runs `git reset --hard origin/qa` |

## Conventions

- **All secrets live in `tools/config.php`** as `define()` constants — the project's existing practice, checked into git. Rotation is manual.
- **Schema source of truth: `tools/db.sql`** (single full-schema dump). One-off alter scripts live alongside as `tools/<feature>_migration.sql` or `.php` (see `updateCanceledAt.php`, `fixAddressFields.php`).
- **API is monolithic `www/api.php`** — one big switch on `$_REQUEST['method']`. New features add a new `case`. `requireRole('admin'|'user'|'superadmin'|'support'|array_of_these)` gates each method. `admin`/`superadmin` bypass role checks. `API_success($arr)` / `API_fail($msg)` both exit.
- **Auth is token-based** — POST `/api.php?method=login` with username+password returns a UUID token stored on `User.token`; every subsequent request passes `token=...` and `requireRole()` resolves it to `$uid`.
- **Password hash**: `sha512($password . HASHSALT)`, with `HASHSALT` defined in `tools/config.php`.
- **Webhooks are standalone .php files in `www/`** — include `../tools/db.php` + the relevant integration class. Always log the raw body into `HookHistory` before processing (see `guesty_hook.php`).
- **Integration classes in `tools/`** — one class per external vendor (`Guesty.php`, `BlandAI.php`, etc.). Static helpers that wrap the vendor's REST API.
- **DB access**: `$db->fetchOne`, `$db->fetchAll`, `$db->fetchValue`, `$db->query`. Always escape with the `s()` (string) or `i()` (int) helpers.

## Support call infrastructure (bland.ai)

- Inbound number `+18056788907` → bland AI agent.
- Post-call + in-call events → `www/bland_hook.php` (also serves bland's `request_human_transfer` custom tool).
- Portal access: `admin`, `superadmin`, and `support` roles. `support` users are scoped — sidebar shows only the Calls link, all other menu items hidden in `launch()`. `admin`/`superadmin` get the Calls link in addition to their normal menu. `User.phone_e164` is the warm-transfer target for "Take call".
- API methods gate with `requireRole('support')` — because `admin`/`superadmin` short-circuit `requireRole()` and `support` matches directly, this covers all three.
- Data tables: `Call` (one row per inbound call), `TransferRequest` (code, expiry, accepted-by — 8-char URL-safe code doubles as Slack link hash at `vision.vectorstays.com/#call-<code>`).
- Slack alerts posted via `Calls::postSlackTransferAlert()`; requires `SLACK_BOT_TOKEN` + `SLACK_ALERT_CHANNEL_ID` in `config.php`.
- Live audio: browser connects directly to bland's listen WebSocket URL (minted on demand via `BlandAI::createListenSession()`, exposed through `api.php?method=getListenUrl`). Read-only, PCM16 @ 16kHz — decoded in the browser with Web Audio API in `calls.js`.
- Taking a call: `api.php?method=takeCall` → `BlandAI::warmTransfer(callId, User.phone_e164)`; the support agent speaks on their phone while the portal keeps showing transcript.

## Firebase (vectorsupportagent project) — live-transcript push

- Project: `vectorsupportagent` — used ONLY for the support-call portal. The existing `vector-3b246` Firebase app is untouched.
- Server writes: `tools/Firebase.php` signs JWTs with the service account and PATCHes/PUTs under `/calls/{call_id}/meta`, `/calls/{call_id}/transcript`, `/transfers/{code}`. Called from `tools/Calls.php` on every state change.
- Browser auth: PHP's login handler returns a `firebaseToken` (custom token) alongside `user`. `www/js/api.js` calls `callsAuth.signInWithCustomToken(...)` right after login, Firebase persists the session itself thereafter.
- Two Firebase apps are initialized in `index.html` — the default `window.db` (vector-3b246) and the named `'calls'` app exposed as `window.callsDb` / `window.callsAuth`.
- Service account JSON lives at `tools/secrets/vectorsupportagent-firebase-adminsdk.json` (gitignored via `/tools/secrets/`). The web-SDK config placeholders in `index.html` (`PASTE_WEB_API_KEY_HERE`, etc.) must be filled in from the Firebase Console → Project settings → Web app config.
- Frontend falls back to polling (`api.php?method=getCall` every 2s) if `window.callsDb` is unavailable — so the portal keeps working even if Firebase config isn't pasted yet.

## Calls portal UI

- Lives inside the main SPA at `www/index.html` — no separate `calls/` directory. `www/js/calls.js` is a self-contained module exposing `window.VectorCalls`.
- Routing by URL hash on root: `vision.vectorstays.com/#calls` = dashboard, `vision.vectorstays.com/#call-<code-or-id>` = single call view. `calls.js` subscribes to `hashchange` and `$(document).one('ajaxStop', ...)` on page load so the admin default dashboard doesn't race with a hash-driven call view.
- Sidebar "Calls" entry uses class `callsAccess` — shown explicitly in `launch()` for each role that can see it. Support users get only this link; everything else (`owner-portal`, `adminOnly`) is hidden for them.
- `rightContent` divs: `#callsDashboard` + `#callDetail`, both `callsAccess`. Same Bootstrap theme.
- Dashboard (`getCallsDashboard`) returns: active calls, recent completed calls (last 100), 30-day daily counts, listings-that-have-had-calls for the filter dropdown, and summary totals (today / week / transferred / all-time). Chart.js draws the daily bars. Listing filter scopes every query (`?listing_id=...`). Opening a completed call shows the transcript + caller context with the listen/take-call controls hidden.

## InsForge (retired for this iteration)

InsForge project `18c8f7ab-c8d0-4499-850d-b36197a1e762` (appkey `554ua2kh`, us-east) is still linked via `.insforge/project.json` but **not currently used**. The support-call feature is fully native to the PHP/MySQL stack. Revisit InsForge only for a future redeploy or net-new customer-facing surface.

## Local dev notes

- No PHP or Docker locally — development happens against the QA host. There's no CI; after editing, push and visit `/deploy.php?pw=<pw>&deploy=1` to deploy.
- To iterate on a migration safely, apply it to a fresh MySQL spun up from `docker/mysql/init.sql` + `tools/db.sql`, then promote to QA/prod manually.
