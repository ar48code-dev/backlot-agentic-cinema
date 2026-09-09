---
name: Browser JSX evaluation
description: Compatibility rules for evaluating saved AI-generated React components directly in the browser.
---

When evaluating saved generated JSX in a browser, remove any React imports, default exports, and duplicate hook destructuring before transformation. With Babel Standalone 8, explicitly select the classic React JSX runtime so the result uses `React.createElement` instead of emitting `require("react/jsx-runtime")`.

**Why:** Older saved tools may include their own React imports, which collide with injected hooks. Babel 8 can also emit module-loader calls that do not exist inside browser `new Function` evaluation. Both failures prevent otherwise-valid saved tools and games from opening.

**How to apply:** Use the Babel module namespace’s live `transform` export, sanitize saved source consistently with the standalone publisher, select the classic runtime, and verify at least one existing saved component evaluates to the expected component function without `require`.