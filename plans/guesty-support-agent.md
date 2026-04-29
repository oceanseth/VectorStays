# Plan: Guesty Integration + AI Support Agent

**Status:** design phase, not yet implemented.
**Owner:** Seth
**Last updated:** 2026-04-29

## 1. Goal

A host running their short-term-rental business on Guesty connects BnBMesh in three minutes, lists our shared support number `+1‑805-XXX‑XXXX` on every Guesty listing, and from then on:

1. Guests dial the BnBMesh number.
2. Our Vapi-powered AI agent identifies the caller by phone, looks up their reservation in Guesty, knows the listing's amenities, check-in instructions, and house rules, and handles the call autonomously.
3. If the caller asks for something the agent can't resolve (refund, key swap, broken AC), the agent texts the host a one-tap join link to bring them into the live call.
4. Anything the agent learns or promises during the call gets written back to Guesty as a reservation note.

This document describes the data model, the auth flow, the support-agent prompt + tools, and the phased implementation.

---

## 2. How a host connects Guesty

### 2.1 Auth flow (host-facing)

Guesty's [Open API](https://open-api-docs.guesty.com/) uses **OAuth2 client credentials**. The host:

1. In Guesty dashboard → Integrations → API → **Create application**.
   - Name: "BnBMesh"
   - Scopes: `open-api` (read+write to listings, reservations, guests, calendar)
2. Guesty generates a `client_id` and `client_secret` (one-time display; they save it).
3. Host returns to BnBMesh → Dashboard → Integrations → **Connect Guesty**.
4. Pastes both values, plus their Guesty `account_id` (visible in the Guesty URL after login).
5. We do a test fetch (`GET /v1/listings?limit=1` with the bearer token we just minted). If it succeeds, we mark the integration active and trigger the initial sync.

### 2.2 What we exchange the credentials for

```
POST https://open-api.guesty.com/oauth2/token
  grant_type=client_credentials
  client_id=<host's client_id>
  client_secret=<host's client_secret>
  scope=open-api
→ { access_token: "eyJ...", expires_in: 86400, token_type: "Bearer" }
```

Token is good for 24 hours. We refresh on-demand the next time we hit Guesty (cache the token, refresh when `expires_at < now + 60s`).

### 2.3 Where credentials live

```
bnbmesh:host:{uid}:guesty                    → JSON blob (see schema below)
```

Schema:
```json
{
  "account_id":   "5f1234abcd",
  "client_id":    "client-...",         // encrypted, see §6
  "client_secret":"...",                 // encrypted
  "access_token": "eyJ...",              // cached, regenerable
  "access_token_expires_at": "2026-04-30T12:00:00Z",
  "connected_at": "2026-04-29T10:00:00Z",
  "last_sync_at": "2026-04-29T10:01:30Z",
  "last_error":   null,
  "status":       "active"               // active | error | revoked
}
```

The `client_id` and `client_secret` are **encrypted with AWS KMS** before write (envelope-encrypted via `aws-kms` SDK in the Lambda). The KMS key is a dedicated alias `alias/bnbmesh-host-secrets`. The Lambda's IAM role gets `kms:Encrypt`/`kms:Decrypt` on that key only. Plain-text secrets never touch Redis on disk.

**Why not Secrets Manager:** one secret per host scales unhappily on Secrets Manager pricing ($0.40/secret/month). KMS-encrypted Redis blobs cost nothing per host.

---

## 3. What we sync from Guesty

### 3.1 Initial sync (on credential-save)

Triggered by the Lambda right after the host clicks "Connect". Pulls everything once, paginated, in the background:

| Resource     | Endpoint                                    | Stored at                                         |
|--------------|---------------------------------------------|---------------------------------------------------|
| Listings     | `GET /v1/listings?limit=100&fields=...`     | `bnbmesh:host:{uid}:listing:{listing_id}`         |
| Reservations | `GET /v1/reservations?checkOutDate>=today`  | `bnbmesh:host:{uid}:reservation:{reservation_id}` |
| Guests       | `GET /v1/guests?limit=100`                  | `bnbmesh:host:{uid}:guest:{guest_id}`             |

For reservations we keep a forward window — anything checking out today or later, plus 30 days back for context (refunds, follow-ups). Older data isn't loaded until/unless we need it.

**Phone index for inbound matching** is built as we ingest:

```
bnbmesh:phone-index:{e164_phone}  →  SET of "uid:reservation_id" pairs
```

When a call comes in, we look up the caller's E.164 phone in that one set and get back every relevant reservation across all hosts. Most callers will have one match. Multi-match is handled in §5.2.

### 3.2 Incremental sync (Guesty webhooks)

After the initial sync completes, we register a webhook in Guesty pointing at:

```
POST https://bnbmesh.ai/api/integrations/guesty/webhook?account_id={account_id}
```

We subscribe to:

- `reservation.new` — add to `bnbmesh:host:{uid}:reservation:*` and update phone-index
- `reservation.updated` — overwrite the existing record
- `reservation.canceled` — mark canceled, deactivate phone-index entry
- `guest.updated` — update guest record (especially phone changes)
- `listing.updated` — update listing, especially amenities/wifi/check-in fields

The webhook handler verifies the request via Guesty's HMAC signature (header `x-guesty-signature`).

### 3.3 Periodic backstop sync

A scheduled Lambda runs nightly (CloudWatch Events cron `0 8 * * ? *`) and re-syncs each host's reservations from the last 7 days. Catches any webhook misses.

---

## 4. Support Agent (Vapi) — design

### 4.1 Identity

- **One shared phone number** for all BnBMesh hosts (Vapi-provisioned, BYOT-Twilio-optional).
- **One Vapi assistant** named `BnBMesh Guest Support`. Per-host customization happens at call-start via metadata + system-message injection (not assistant cloning).
- Voice: same as our existing support assistant (Elliot). Friendly, concise, escalates rather than hallucinates.

### 4.2 System prompt (skeleton)

```
You are the BnBMesh AI support agent. You answer the support number for
multiple short-term rental hosts. Each call is for ONE specific reservation
once we identify the caller.

YOUR JOB:
- Identify the caller fast (we'll inject their reservation context as
  a system message when we know who they are).
- Answer questions you have an answer to: wifi password, check-in time,
  parking, address, house rules, nearby recommendations.
- For things you don't know or that require host judgment (early
  check-in, refunds, repairs, key replacement, anything emotional),
  call notify_host with a clear summary and tell the caller "I'm
  bringing the host into this call now — stay on the line."
- ALWAYS update the reservation with a note when something is decided
  or promised (call update_reservation_note).

VERIFICATION:
- If the caller's phone number didn't match any reservation, ask them
  for a confirmation code. Call lookup_reservation_by_code.
- If still no match, politely tell them you can't find a reservation
  on this number and offer to take a message for the host they're
  trying to reach (call leave_message_for_host).

TONE:
- Warm but efficient. Don't repeat yourself. Don't apologize three times.
- Don't volunteer that you're an AI unless asked. If asked, say yes,
  you're BnBMesh's automated support, and a human is one tap away.
```

### 4.3 Tools (Vapi function calls)

| Name                          | When | Returns / does |
|-------------------------------|------|----------------|
| `lookup_reservation_by_phone` | Auto, on call start (server-side; no LLM call) | Resolves caller phone to reservation(s) |
| `lookup_reservation_by_code`  | When phone match fails or caller offers a code | `{ reservation, listing, host }` |
| `verify_with_sms_otp`         | When phone is ambiguous (multiple recent stays) | Sends a 6-digit OTP to the guest's phone, returns true on confirm |
| `get_listing_details`         | When caller asks about wifi, parking, check-in, address | Listing fields including private fields normally hidden |
| `update_reservation_note`     | When the agent promises something or learns a fact | PATCHes Guesty reservation; appends "[BnBMesh AI] {timestamp} {text}" |
| `notify_host`                 | When escalating | SMSes the host's phone with a `https://bnbmesh.ai/#call-{id}` link |
| `leave_message_for_host`      | When caller can't be matched but wants to leave a message | Stores in `bnbmesh:host:{uid}:messages` and SMSes the host |
| `end_call_with_summary`       | When wrap-up is appropriate | Saves a summary, ends the Vapi call |

Tools that touch Guesty (`get_listing_details`, `update_reservation_note`) read/write through our Lambda — we never expose Guesty creds to the assistant.

### 4.4 Context injection on call-start

Vapi's web/phone-call lifecycle gives us a `call.created` webhook before the assistant speaks. We:

1. Look up `from_number` against `bnbmesh:phone-index:*`
2. If unique reservation match: hydrate `{ reservation, listing, host }` from Redis
3. Push a system message into the assistant via Vapi's `call.update` API:
   ```
   "Reservation context: {guest_name} is on a {listing_title} stay
   from {checkIn} to {checkOut}. Listing address: {address}.
   Wifi: {wifi}. Check-in: {checkIn_time}. House rules: {rules}.
   The host is {host_name}, reachable at {host_phone}."
   ```
4. If no unique match: leave context empty; the agent's first turn will
   start the verification flow.

We do **not** start the assistant talking until the lookup completes (max 600ms). If the lookup is slow we time out and let the agent open with a generic greeting.

---

## 5. Inbound call flow

### 5.1 The happy path

```
Guest dials BnBMesh number
      ↓
Vapi answers, fires call.created webhook to our Lambda
      ↓
Lambda: lookup_reservation_by_phone(from_number)
      ↓
Single match found
      ↓
Lambda: PATCH /call/{id} with system message containing context
      ↓
Vapi assistant first turn: "Hi {first_name}, thanks for calling
   BnBMesh support for {listing_title}. How can I help?"
      ↓
Conversation. Agent uses get_listing_details for FAQs.
      ↓
On end: end_call_with_summary writes a note back to Guesty.
```

### 5.2 Multiple-match path

Same caller has stayed at multiple listings (returning guest, or the
phone number is shared by multiple guests).

```
Lookup returns 3 matches (one current, two historical)
      ↓
We pick the "current/upcoming" reservation if exactly one is in [-1d, +30d]
   - if so, treat as single match
   - else, the agent asks: "I see a few reservations on this number —
     are you calling about your stay at {nickname A} or {nickname B}?"
      ↓
Agent calls verify_with_sms_otp(reservation_id) if the caller picks one
   that's outside the auto-trust window.
```

### 5.3 No-match path

```
No reservation found for caller phone
      ↓
Agent asks for a confirmation code
      ↓
Caller provides code → lookup_reservation_by_code → match
      ↓
Optional: agent texts an OTP to the guest's phone-on-file to confirm
   "I called from someone else's phone" scenarios
      ↓
Continue as happy path
```

If the caller can't produce a code: agent offers to take a message
(`leave_message_for_host`) addressed to whichever host they were
trying to reach (caller names the listing or city).

### 5.4 Escalation path

Trigger words / intents that flip the agent to "escalate now":
- Anything refund-related
- "broken", "leak", "doesn't work", "can't get in"
- "manager", "owner", "talk to a person"
- Anything legal, safety, or medical

```
Agent calls notify_host(host_id, summary, urgency)
   → SMS to host: "Guest at {listing_nickname} needs you — {summary}.
                   Tap to join: https://bnbmesh.ai/#call-{id}"
   → Agent: "I've alerted {host_first_name} — they should be joining
            in a moment. Let me stay on with you while we wait."
```

When the host clicks the link, the same `/#call-{id}` viewer pattern
we already built kicks in — they see the live transcript and can use
the "add context" bar to inject instructions into the running call.

---

## 6. Storage & security

### 6.1 KMS key

Provision a dedicated KMS CMK for host-secret encryption:

```hcl
resource "aws_kms_key" "host_secrets" {
  description             = "BnBMesh per-host integration secrets"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}
resource "aws_kms_alias" "host_secrets" {
  name          = "alias/bnbmesh-host-secrets"
  target_key_id = aws_kms_key.host_secrets.id
}
```

Lambda IAM gets `kms:Encrypt`, `kms:Decrypt` on this key only.

### 6.2 In-Lambda encryption helper

```js
import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms'
const kms = new KMSClient({})
async function encrypt(plaintext) {
  const r = await kms.send(new EncryptCommand({
    KeyId: 'alias/bnbmesh-host-secrets',
    Plaintext: Buffer.from(plaintext, 'utf8'),
  }))
  return Buffer.from(r.CiphertextBlob).toString('base64')
}
async function decrypt(ciphertext) {
  const r = await kms.send(new DecryptCommand({
    CiphertextBlob: Buffer.from(ciphertext, 'base64'),
  }))
  return Buffer.from(r.Plaintext).toString('utf8')
}
```

(Watch for the `@aws-sdk/client-kms` Node 22 ESM/CJS issue — same one
we hit with `client-ssm`. If we hit it, sign the SigV4 request manually
and post to the KMS REST API. ~80 lines. Documented in `project_terraform.md`.)

### 6.3 Webhook signature verification

Guesty signs webhook requests with HMAC-SHA256 of the raw body using
the webhook's secret. Verify via `node:crypto.timingSafeEqual`. Same
pattern as our Stripe webhook handler; reuse the helper.

### 6.4 Audit

Every Guesty API call we make on the host's behalf gets logged:

```
bnbmesh:host:{uid}:guesty:audit  →  LIST of { ts, method, path, status, op }
                                    capped at 5000, 90-day TTL
```

The host can see this in the dashboard ("Activity" tab) so they have a
log of what we did with their account.

---

## 7. UI changes

### 7.1 Dashboard → Integrations tab (new)

Adds a section to `/#dashboard` (or a sub-route `/#dashboard/integrations`) with:

- **Guesty card**
  - Status (Not connected / Connected / Error)
  - "Connect Guesty" button → opens a modal
  - Once connected: shows account_id, last sync, count of synced
    listings/reservations, an "Activity log" link, and a "Disconnect" button

### 7.2 Connect-Guesty modal

```
┌──────────────────────────────────────────────────────┐
│  Connect Guesty                                  [×] │
├──────────────────────────────────────────────────────┤
│  We'll sync your listings + reservations and use     │
│  them to identify guests when they call our shared   │
│  support number.                                     │
│                                                      │
│  How to find your credentials                        │
│  ───────────────────────────                         │
│  1. Open Guesty → Integrations → API                 │
│  2. Click "Create application"                       │
│  3. Name it "BnBMesh" and grant `open-api` scope     │
│  4. Copy the Client ID and Client Secret here        │
│                                                      │
│  Account ID                                          │
│  [_____________________________________________]     │
│                                                      │
│  Client ID                                           │
│  [_____________________________________________]     │
│                                                      │
│  Client Secret                                       │
│  [_____________________________________________]     │
│                                                      │
│  [   Cancel   ]                  [   Connect   ]     │
└──────────────────────────────────────────────────────┘
```

On submit, the dashboard shows live sync progress: "Syncing… 42 listings,
311 reservations, 1,204 guests."

### 7.3 Per-listing badge

Active listings that came from Guesty get a small `via Guesty` badge so
the host knows that listing isn't editable in BnBMesh (Guesty is the
source of truth).

---

## 8. Open questions / risks

- **Phone matching false positives.** Two guests with the same phone
  number across hosts. Mitigation: prefer "current/upcoming" stays;
  fall back to OTP verification on ambiguous matches.
- **Guesty rate limits.** Open API has a per-app rate limit (~5 req/s).
  The initial sync of a power host with hundreds of reservations could
  bump it. Mitigation: backoff + paginate slowly; the initial sync runs
  async so the user isn't blocked.
- **PII retention.** We're storing guest phone numbers, names, email,
  reservation details. Add a "Delete my host data" flow that purges
  Redis keys + revokes the Guesty token.
- **Token rotation.** If the host rotates their Guesty client secret,
  we silently start failing. Surface that in the dashboard with a clear
  "Reconnect Guesty" CTA.
- **Hosts using a non-Guesty PMS.** Hospitable, OwnerRez, Lodgify,
  Hostfully each have their own APIs. The architecture above is
  generic enough; we'd implement a `bnbmesh:host:{uid}:hospitable` etc.
  with the same key shape and just swap the API layer.

---

## 9. Implementation phases

### Phase 1 — Connect + sync (4–6 hours)

1. KMS key + IAM + new env var (`KMS_KEY_ALIAS`)
2. Lambda: `tools/encrypt.mjs` helper
3. New API: `POST /api/me/integrations/guesty` (host pastes creds, we
   test, encrypt, store, kick off sync)
4. New API: `GET /api/me/integrations/guesty` (status + counts)
5. New API: `DELETE /api/me/integrations/guesty` (revoke)
6. Background sync (run inline if total <100 records, otherwise
   self-recursively invoke a sync-worker Lambda)
7. UI: Integrations card on dashboard + Connect-Guesty modal

### Phase 2 — Webhooks + phone index (2–3 hours)

1. New API: `POST /api/integrations/guesty/webhook` (Guesty → us)
2. Auto-create the webhook in Guesty during Phase-1's connect flow
3. Build `bnbmesh:phone-index:*` from incoming `reservation.*` events
4. Backfill the index with current data on first sync

### Phase 3 — Support assistant + call routing (3–4 hours)

1. New Vapi assistant `bnbmesh-shared-support` with the system prompt
   from §4.2 and the tool list from §4.3
2. Provision the inbound number on Vapi (or BYOT a Twilio number)
3. Vapi-side configuration: route the inbound number to the assistant,
   set Server URL to our `/api/integrations/vapi/inbound-webhook`
4. Implement that webhook: phone-index lookup → context injection
5. Implement the tool endpoints: `lookup_reservation_by_phone`,
   `lookup_reservation_by_code`, `get_listing_details`,
   `update_reservation_note`, `notify_host` (SMS via Twilio or
   Vapi's SMS). Each tool is a route under `/api/agent/tools/*`.
6. Wire `notify_host` to an SMS provider — recommend Twilio
   Programmable Messaging (separate from Vapi numbers).

### Phase 4 — Polish (2 hours)

1. Activity log UI per integration
2. "Reconnect" flow for expired secrets
3. Periodic backstop sync (CloudWatch scheduled rule)
4. Per-listing "via Guesty" badge

Total estimated time: **11–15 hours**, parallelizable. Phase 1
unlocks all dashboard value; Phase 3 unlocks the AI customer support
product the user is paying $20/listing for.

---

## 10. References

- Guesty Open API docs: https://open-api-docs.guesty.com/
- Existing legacy integration (PHP, for reference): `tools/Guesty.php`,
  `crons/syncGuesty.php`, `www/guesty_hook.php`. The Open API endpoint
  shapes are the same; the auth changed from key+secret-direct to
  OAuth2 client credentials.
- Vapi server URL / call-control docs: https://docs.vapi.ai/server-url
