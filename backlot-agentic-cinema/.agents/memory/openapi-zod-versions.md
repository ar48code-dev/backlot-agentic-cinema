---
name: OpenAPI and Zod versions
description: Compatibility note for generated API validators in this workspace
---

When authoring OpenAPI contracts for this workspace, prefer `type: number` for identifiers unless the generated Zod package is confirmed to support `z.int()`.

**Why:** The code generator can emit `z.int()` for OpenAPI integer fields, while the workspace's installed Zod runtime may still be Zod 3 and lack that method.

**How to apply:** After codegen, run the library typecheck before building routes or clients; if it fails on `z.int`, adjust the contract rather than editing generated output.