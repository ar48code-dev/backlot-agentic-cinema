---
name: Runtime esbuild packaging
description: Constraints for compiling generated JSX into standalone browser bundles from the running API service.
---

When a bundled Node server invokes esbuild's JavaScript API at runtime, esbuild itself must remain an external package. Normalize hook declarations before compilation, and perform name-based source validation before minification rather than against the minified output.

**Why:** Bundling esbuild prevents it from locating its native executable. Generated components may already declare React hooks, and minification can legitimately rename the component after successful compilation.

**How to apply:** Use this rule for any server endpoint that packages stored/generated JSX into a browser bundle at request time.