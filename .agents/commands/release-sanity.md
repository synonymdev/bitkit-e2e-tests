---
description: "/release-sanity [version or release PRs] — Derive a minimal Bitkit release sanity plan from changes and existing evidence"
argument_hint: "[version or release PRs]"
---

Use the shared [release-sanity skill](../skills/release-sanity/SKILL.md), which routes to the canonical [release QA method](../../docs/release-qa.md). Resolve links relative to this command file.

Treat the supplied version or release PRs as the requested cut. Return the evidence map, proposed checklist and remaining gaps in the requested format. Generating a plan does not imply test execution or release approval. The 3.1.0 worked example is historical guidance, not the default suite.
