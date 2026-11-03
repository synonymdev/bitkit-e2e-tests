---
name: release-sanity
description: Derive a Bitkit pre-release sanity checklist from release changes and existing automated/device evidence across Android and iOS. Use when planning release sanity or identifying remaining coverage gaps; this produces a plan, not release sign-off.
---

# Release sanity

Read and apply the canonical [release QA method](../../../docs/release-qa.md) in this repository before deriving a suite. Resolve that link relative to this file. This skill operates with the `bitkit-e2e-tests` checkout; it has no dependency on personal skills or a private spreadsheet.

Use the requested release/version PRs to discover previous tags, candidate app builds/revisions and the actual E2E revisions. Read the relevant source, run results and latest device-review evidence. Ask only for missing inputs that prevent a useful plan; label unavailable evidence and proceed with independent analysis.

Return the pinned cut, change-to-coverage map, minimal recurring mainnet smoke, justified release-specific cases, and remaining gaps. Preserve distinctions between reused evidence, planned execution, retries, skips and failures. Follow the method's case fields and execution boundaries.

Read the [3.1.0 example](../../../docs/release-qa/3.1.0-example.md) when a worked example would help. Do not copy its checklist or accepted exceptions into a new release without reassessing changes and coverage.

Stop after delivering the requested plan or documentation update unless test execution or release coordination is also authorized. Release readiness consumes this plan and its eventual results; it is a separate decision.
