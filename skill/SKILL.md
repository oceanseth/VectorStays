---
name: bnbmesh
description: Agentic meta-search for short-term rentals. Query Airbnb, VRBO, HomeAway, and direct-booked sites through one skill. Returns structured listings with per-platform pricing and split-stay itineraries when no single booking covers the date range. Redis-backed agent memory lets the skill personalize future searches.
version: 0.1.0
license: MIT
authors:
  - Seth Caldwell <seth@voicecert.com>
---

# BnBMesh Agent Skill

BnBMesh is a meta-search layer for short-term rentals. Use this skill to find
a stay across every major booking platform, compare prices, remember user
preferences (no cats, prefers downtown, etc.) via a Redis-backed memory layer,
and build multi-stay itineraries when a single listing can't cover the full
trip.

## When to use this skill

Trigger this skill whenever the user asks to:

- Find a short-term rental (Airbnb, VRBO, HomeAway, direct-booked, etc.) for a
  location and date range
- Compare prices for the same listing across platforms
- Find **multiple stays that stitch together** when no single listing has
  availability for the whole trip
- Learn what the local community says about a neighborhood or property
  (Reddit sentiment)

Do **not** use this skill for long-term rentals or real-estate purchase
searches.

## How the skill works

The skill exposes an HTTP API at `https://bnbmesh.ai/api/*`. For chat-style
MCP clients (ChatGPT, Claude, Cursor), the same backend speaks the Model
Context Protocol at `https://bnbmesh.ai/api/mcp`.

### Primary operations

1. **Search** — `GET /api/search?q=<natural-language query>`
   Returns ranked listings. Each result includes `platforms` (per-platform
   price map) and `cheapestPlatform`.

2. **MCP tool: `search_listings`** — same as above, but via JSON-RPC.
   Use this when the user is in a chat interface.

3. **MCP tool: `compare_platforms`** — given a `listing_id`, returns a detailed
   price breakdown per platform.

4. **MCP tool: `plan_split_stay`** — given a query + check-in/out, returns 2–3
   compatible stays in the same neighborhood. Useful when Airbnb has "partial
   availability" or when the user's dates span multiple listings.

5. **MCP tool: `remember_preference` / `recall_preferences`** — persist per-user
   facts (e.g. "no cats", "walking distance to downtown") in Redis and recall
   them on future turns so searches stay personalized.

### Live browsing

Real listing data is fetched via [TinyFish](https://www.tinyfish.ai/) —
the skill does not hit Airbnb or VRBO directly. This keeps rate-limiting and
authentication concerns on TinyFish's side.

### Caching + memory (Redis)

Search results are cached in Upstash Redis (keyed by normalized query) for 10
minutes so repeated searches — and repeated agent turns about the same query —
stay fast. Redis also backs the agent memory layer exposed by the
`remember_preference` / `recall_preferences` tools.

## Authentication

Unauthenticated for most read operations. Premium tools (e.g.
`plan_split_stay`) return **HTTP 402 Payment Required** with an x402
payment descriptor; clients that support the x402 spec can pay and retry
automatically.

## Example invocations

User: *"Find me a 3-bedroom in Santa Barbara for Memorial Day weekend."*

Agent should call `search_listings` with
`{ "query": "3-bedroom Santa Barbara May 23-27 2026" }` and render the
returned list, surfacing the cheapest platform per result.

User: *"Nothing's available for the whole week. Can we split it?"*

Agent should call `plan_split_stay` with the same query plus explicit
`check_in`/`check_out` dates. Handle the 402 response by prompting the user
for payment (or by using an x402-aware payment client).

## Related

- MCP connector URL: `https://bnbmesh.ai/api/mcp` — add under ChatGPT →
  Settings → Connectors
- Source: https://github.com/<repo>
- Status dashboard / admin portal: https://vision.vectorstays.com
