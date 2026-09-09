---
name: Gemini model availability
description: Model catalog visibility and actual generateContent access can differ for newly issued Gemini API keys.
---

Use a minimal non-sensitive `generateContent` probe before selecting a Gemini model for the app. A model can appear in `GET /v1beta/models` and advertise `generateContent` while invocation is rejected or returns a response shape the client does not expect. Prefer the model that passes the probe and the application's expected response contract.

**Why:** The API key exposed a 404 for an older catalog-listed model and a successful but incompatible response for a newer candidate; a listed 3.5 Flash Lite model returned the expected text response.

**How to apply:** Keep model selection centralized in the API route and re-run a minimal generation check when model availability errors or response-shape failures occur.