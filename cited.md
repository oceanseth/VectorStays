# Citations & Sponsor Integrations

This hackathon submission builds on the tools and data sources below.

## Sponsor tools integrated

| Sponsor | Use in this project |
|---|---|
| **shipables.dev** | The BnBMesh skill is published via `npx @senso-ai/shipables publish` from `./skill/SKILL.md`. That's also how we expect other MCP-aware agents to discover us. |
| **TinyFish (tinyfish.ai)** | All live listing data for Airbnb, VRBO, HomeAway, and direct-booked sites is fetched through TinyFish's Agent API (`/v1/automation/run-sse`). We do not scrape these sources directly. Called from the AWS Lambda behind `bnbmesh.ai/api/search`. |
| **Upstash Redis** | Two-tier cache + agent memory layer. TinyFish search results are cached at `bnbmesh:search:<query>` with a 10-min TTL, and the `remember_preference`/`recall_preferences` MCP tools persist per-agent facts in `bnbmesh:mem:<agent_id>`. |
| **x402** | The `plan_split_stay` tool is monetized behind the x402 payment protocol. Unauthenticated callers receive `HTTP 402 Payment Required` with a payment descriptor; x402-aware clients can pay and retry transparently. |
| **guild.ai** | Planned integration: the listing-scraper search agents and support-call observers will dispatch through guild.ai once we're off their waitlist. Manifest and webhook wiring are stubbed in `api/src/guild.mjs`. |
| **Vapi** | Alternative voice provider for support-call handling (alongside bland.ai). Admins can toggle between providers from the calls dashboard. |

## Other data sources & libraries

- **bland.ai** — voice agent that answers the inbound support number `+1 (805) 678-8907` and handles warm-transfer requests to human support via Slack.
- **Firebase Realtime Database** (`vectorsupportagent` project) — live transcript + call-state push to the admin portal, authed via custom Firebase tokens minted on login.
- **AWS Route 53 + CloudFront + Lambda + S3 + ACM** — all provisioned via Terraform under `./terraform/`.
- **Slack Web API** — bot posts warm-transfer alerts with one-time join codes to `#C0AFX4TMRGU`.

## Data provenance for search results

All rental availability, pricing, and listing metadata is retrieved live at
query time via TinyFish. Results cached in Redis for ≤10 minutes. We do not
store or redistribute listings outside that cache window.

## Mock data disclosure

Where live APIs are not yet wired (TinyFish, Reddit, guild.ai if on
waitlist), the MCP tools fall back to deterministic mock responses seeded by
the query string. Those responses are clearly labelled as mock in
`api/src/index.mjs`.
