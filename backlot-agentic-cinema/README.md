# Backlot

Backlot is an AI production assistant for film and television producers. It turns a plain-English production need, optionally grounded in a real script or production PDF, into a reviewed internal tool or a small playable interactive experience.

## The problem

Production teams constantly need small, specific tools: continuity trackers, clearance logs, cast availability boards, petty-cash registers, and similar workflows. These needs are often too specialized or too short-lived to justify waiting for a developer, but spreadsheets and generic software lose the context that makes the workflow useful.

Backlot gives a producer a production brief and a source document, then turns that context into something the team can review and use without requiring a developer to hand-build every internal tool.

## What it does

1. A producer describes the workflow in plain English.
2. The producer can attach a script or production PDF.
3. Vertex AI reads the PDF natively and extracts grounded characters, scenes, props, locations, and rights/clearance mentions.
4. The producer reviews the extracted facts.
5. The producer chooses:
   - **Production** — a practical internal tool with fields, actions, and grounded initial records.
   - **Interactive** — a small, single-screen 2D experience built from the same facts.
6. Backlot generates and supervises the result.
7. A successfully built tool can be published as a standalone path under `/tools/<slug>/`.

## Agent architecture

Backlot separates the AI work into distinct responsibilities:

### Grounding agent

Receives the original PDF as native `application/pdf` multimodal input. It extracts document-grounded:

- Characters
- Scenes
- Props
- Locations
- Songs, brands, artwork, and other rights mentions

The extracted facts are persisted as `grounded_facts` and shown to the producer before any specification is generated.

### Specification agent

Converts the reviewed brief and grounded facts into a structured tool specification.

For Production mode, the spec contains fields, actions, and grounded initial records.

For Interactive mode, the agent must choose exactly one fixed mechanic:

- `match` — match real props or characters to their correct scene or location.
- `branch` — a simple two- or three-choice decision game using real characters and scenes.

Interactive specs also include the real entities, instructions, and a reachable win/end condition. Open-ended game types are intentionally not supported.

### Build agent

Generates a self-contained React component from the approved specification.

Production components use local state and provide the specified fields and actions.

Interactive components are single-screen, 2D DOM/Canvas experiences. They do not use 3D, physics, generated external assets, network calls, routing, or placeholder production entities.

### Build Supervisor agent

Runs separately from component generation. It checks the generated component against the specification and grounded facts before the request can become `built`.

For Production mode it validates the requested fields, actions, grounded initial records, and source restrictions.

For Interactive mode it specifically validates:

- The selected `match` or `branch` mechanic is actually implemented.
- Real grounded names and data are used instead of generic placeholders.
- The win/end state is reachable through the controls.
- The win state fully replaces or obscures the prior game content.

Compiler failures and supervisor rejections are persisted with their real reason and can be retried.

### Deploy/publish agent

Backlot packages a successful component with esbuild and persists a standalone HTML document and JavaScript bundle. The API serves them at:

- `/tools/<slug>/`
- `/tools/<slug>/app.js`

The standalone page does not include the Backlot shell.

## Integrations

### Vertex AI Gemini

Backlot uses the Google Cloud service-account credential stored as the `GCP_SERVICE_ACCOUNT_JSON` secret. It authenticates with Google Cloud OAuth and calls:

`https://aiplatform.googleapis.com/v1/projects/backlot-studio-2026/locations/global/publishers/google/models/gemini-2.5-flash:generateContent`

The same centralized Vertex client is used for text specification generation, native PDF grounding, component generation, and Build Supervisor validation. There is no `GEMINI_API_KEY` or AI Studio fallback.

The service account's project must have the Vertex AI API enabled, billing enabled, and permission to use Vertex AI.

### Replit

The project runs as Replit artifacts with a web frontend and shared API service. Replit Deployments provide the host and runtime for the app. Backlot's publish endpoint programmatically stores and serves standalone tool paths inside that deployment, such as `/tools/continuity-check/`; it does not create a separate Replit deployment or subdomain for each generated tool.

## Repository layout

```text
artifacts/backlot/                 React/Vite production desk UI
artifacts/api-server/              Express API and Vertex orchestration
artifacts/api-server/src/lib/      Centralized Vertex client
lib/api-spec/openapi.yaml          Source API contract
lib/api-client-react/              Generated React Query client
lib/api-zod/                       Generated server validators
lib/db/src/schema/                 Drizzle/PostgreSQL schema
```

## Setup

### Prerequisites

- Node.js 24 or compatible current Node.js runtime
- pnpm 10
- PostgreSQL
- A Google Cloud project with Vertex AI enabled

### Install

```bash
pnpm install
```

### Required environment and secrets

Set these in the Replit environment or in a local development environment:

- `DATABASE_URL` — PostgreSQL connection string.
- `GCP_SERVICE_ACCOUNT_JSON` — the complete Google Cloud service-account JSON, stored as a secret. The service account must have Vertex AI access. The project ID is read from the JSON's `project_id` field.

The services also use runtime-provided configuration:

- API server: `PORT` (the configured workflow uses port `8080`).
- Backlot Vite app: `PORT` and `BASE_PATH` (the configured workflow uses port `23000` and `/`).

Do not add a `GEMINI_API_KEY`; this build has migrated from the AI Studio API-key approach to Vertex AI.

### Run development workflows

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/backlot run dev
```

In Replit, the configured workflows are:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/backlot run dev
```

### Validate and build

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run build
PORT=23000 BASE_PATH=/ pnpm --filter @workspace/backlot run build
```

After changing `lib/api-spec/openapi.yaml`, regenerate the clients:

```bash
pnpm --filter @workspace/api-spec run codegen
```

After changing the Drizzle schema in development:

```bash
pnpm --filter @workspace/db run push
```

## Known limitations

- Interactive mode intentionally supports only `match` and `branch`. This is a product constraint that keeps generated experiences small, testable, and grounded in production entities—not an unfinished open-ended game system.
- Interactive experiences are single-screen 2D DOM/Canvas components. There is no 3D rendering, physics simulation, multiplayer, external asset pipeline, or network-backed game state.
- Generated components keep their records in local React state. A published tool does not yet persist user-entered runtime records back to Backlot.
- PDF grounding depends on Vertex AI access, model availability, service-account permissions, quota, and document quality. Transient Vertex 429/503 responses receive bounded retries, but a sustained provider failure is surfaced to the user.
- The current service-account setup reads `project_id` from `GCP_SERVICE_ACCOUNT_JSON`; project and region are not currently separate user-configurable settings.
- Standalone tools are paths in the same Replit deployment. Backlot does not programmatically provision a separate deployment or custom subdomain per generated tool.
- This repository contains generated client files and generated standalone tool data because they are part of the current runnable Replit project.

## Verified Interactive example

The included development data has been tested with a short script-like PDF containing:

- `RED HERO UMBRELLA`
- `vintage SUNBURST COLA sign`
- `MAYA CHEN`
- `SCENE 12`
- `SCENE 13`

The resulting published match game reached its win state by matching all three real entities to their grounded scenes and could be reset with its Play Again control.

## License

MIT. See [LICENSE](LICENSE).