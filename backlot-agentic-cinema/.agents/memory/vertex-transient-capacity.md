---
name: Vertex transient capacity
description: Handling transient capacity errors from Vertex AI document requests.
---

Vertex AI native document generation can return transient HTTP 429 or 503 responses even when authentication and a minimal text generation probe have just succeeded. Use a small, bounded exponential retry before treating the operation as unavailable; never fall back to a different provider implicitly.

**Why:** A valid service account and working text request were followed by a 429 on the first native PDF request, while the same PDF request succeeded on retry.

**How to apply:** Apply bounded retry only to transient 429/503 generation failures. Preserve the selected Vertex endpoint and surface the final provider error if all attempts fail.