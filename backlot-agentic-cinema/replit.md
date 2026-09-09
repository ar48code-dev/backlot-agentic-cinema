# Backlot

Backlot turns plain-English film and TV production needs and source PDFs into reviewed internal tool specifications using Vertex AI Gemini.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secrets/env: `DATABASE_URL` and `GCP_SERVICE_ACCOUNT_JSON` with Vertex AI access

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/backlot/src/pages/home.tsx` — primary production desk interface and review gate
- `artifacts/api-server/src/routes/tool-requests.ts` — Vertex generation, PDF grounding, supervision, and persisted request API
- `artifacts/api-server/src/lib/vertex.ts` — centralized Vertex AI authentication and generation client
- `lib/db/src/schema/tool-requests.ts` — `tool_requests` PostgreSQL table
- `lib/api-spec/openapi.yaml` — source of truth for request API contracts

## Architecture decisions

- Plain text goes directly to specification generation. PDFs are sent as native multimodal document input, and grounded facts are persisted and reviewed before specification generation.
- After PDF facts are reviewed, the producer chooses Production or Interactive. Interactive specs must choose exactly one fixed mechanic: `match` or `branch`; open-ended game types are not allowed.
- Interactive builds are single-screen 2D DOM/Canvas experiences with real grounded names, a reachable win/end state, no 3D/physics/external assets, and the same standalone publication pipeline as Production tools.
- The specification can include real document entities as initial data. A separate Build Supervisor model call must pass generated code before status becomes `built`.
- All AI agents use Vertex AI Gemini through the configured Google Cloud service account; there is no AI Studio API-key fallback.
- Requests are persisted after a successful generation with `spec-ready` status so the archive survives reloads.
- The client uses generated OpenAPI hooks rather than hand-written fetch wrappers.
- Built tools can be packaged into standalone HTML plus compiled JavaScript and served at human-readable `/tools/<tool-name>/` paths without Backlot's UI shell.

## Product

Producers can describe a production-office need, review the generated tool name, purpose, fields, and actions, build the approved tool, and publish it at a copyable standalone URL. Nothing is built without the review step, and failed packaging is never marked as published.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
