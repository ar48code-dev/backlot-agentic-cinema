---
name: Generated component completeness
description: Preventing truncated AI-generated React components from reaching validation or publication.
---

Generated interactive components can exceed a modest model output budget and arrive as syntactically truncated JSX. Give component generation sufficient output capacity and compile the complete source locally before invoking semantic supervision.

**Why:** Multiple otherwise valid grounded game generations ended mid-element or mid-string until the output allowance was increased.

**How to apply:** Keep the component prompt focused, allow a generous output budget, compile with the same JSX toolchain used for publication, and persist compiler failures as retryable validation failures with the real reason.